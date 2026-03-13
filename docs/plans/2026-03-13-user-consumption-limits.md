# User Consumption Limits & Usage Dashboard

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Limit users to 5 tracked packages with <500k weekly downloads (excluding packages they maintain), and provide a dashboard to view usage.

**Architecture:** Server-side enforcement in the `onTrackPackage` telefunc function checks quota before allowing tracking. A new `/usage/` Vike page displays tracked packages with download counts, maintainer status, and quota usage. The Clerk `UserButton` gets a custom menu item linking to the usage page. Maintainer exemption checks the signed-in user's Clerk emails against npm registry maintainer emails.

**Tech Stack:** React, Vike (file-based routing), Telefunc (RPC), Clerk (`@clerk/backend` for server-side user email lookup, `@clerk/clerk-react` for `UserButton.Link`), Kysely/Turso (DB), npm registry API.

---

## Key Constants

- `MAX_TRACKED_PACKAGES = 5` — max non-maintained packages with <500k weekly downloads
- `WEEKLY_DOWNLOAD_THRESHOLD = 500_000` — packages above this are free to track (they're popular enough to justify tracking)

## Data Flow

1. User clicks "track" on a package
2. Server fetches: (a) user's current tracked packages, (b) npm weekly downloads for the target package, (c) npm registry metadata (maintainers), (d) user's Clerk email addresses
3. If package has ≥500k weekly downloads → allow (doesn't count against quota)
4. If user is a maintainer of the package → allow (doesn't count against quota)
5. Otherwise, count user's existing tracked packages that are <500k downloads AND not maintained by user. If count ≥ 5 → reject
6. Usage page shows all this info in a table for transparency

---

### Task 1: Create `getUserEmails` server utility

**Files:**
- Create: `apps/npm-burst/src/server/clerk-utils.ts`

**Step 1: Write the utility**

```ts
import { createClerkClient } from '@clerk/backend';
import type { Env } from './env';
import { isDevMode } from './env';

export async function getUserEmails(
  userId: string,
  env: Env
): Promise<string[]> {
  if (isDevMode(env)) {
    return ['dev@example.com'];
  }

  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY! });
  const user = await clerk.users.getUser(userId);
  return user.emailAddresses.map((e) => e.emailAddress);
}
```

**Step 2: Commit**

```bash
git add apps/npm-burst/src/server/clerk-utils.ts
git commit -m "feat: add getUserEmails server utility for Clerk email lookup"
```

---

### Task 2: Create `getPackageMaintainers` server utility

**Files:**
- Create: `apps/npm-burst/src/server/npm-maintainers.ts`

This fetches the npm registry metadata for a package and extracts the maintainers list.

**Step 1: Write the utility**

```ts
import type { Kysely } from 'kysely';
import type { DB } from './db-schema';
import { cachedFetch } from './npm-fetch';

export interface NpmMaintainer {
  name: string;
  email: string;
}

export async function getPackageMaintainers(
  db: Kysely<DB>,
  pkg: string
): Promise<NpmMaintainer[]> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;
  const body = await cachedFetch(db, url);
  const data = JSON.parse(body) as { maintainers?: NpmMaintainer[] };
  return data.maintainers ?? [];
}
```

**Step 2: Write helper to check if user is a maintainer**

```ts
export function isUserMaintainer(
  userEmails: string[],
  maintainers: NpmMaintainer[]
): boolean {
  const maintainerEmailSet = new Set(
    maintainers.map((m) => m.email.toLowerCase())
  );
  return userEmails.some((email) => maintainerEmailSet.has(email.toLowerCase()));
}
```

**Step 3: Commit**

```bash
git add apps/npm-burst/src/server/npm-maintainers.ts
git commit -m "feat: add npm maintainer lookup and user-maintainer check"
```

---

### Task 3: Create `getPackageWeeklyDownloads` helper

**Files:**
- Create: `apps/npm-burst/src/server/npm-downloads.ts`

This returns total weekly downloads for a package (sum of all version downloads).

**Step 1: Write the helper**

```ts
import type { Kysely } from 'kysely';
import type { DB } from './db-schema';
import { cachedFetch } from './npm-fetch';

export async function getPackageWeeklyDownloads(
  db: Kysely<DB>,
  pkg: string
): Promise<number> {
  const url = `https://api.npmjs.org/versions/${encodeURI(pkg).replace('/', '%2f')}/last-week`;
  const body = await cachedFetch(db, url);
  const data = JSON.parse(body) as { downloads: Record<string, number> };
  return Object.values(data.downloads).reduce((sum, n) => sum + n, 0);
}
```

**Step 2: Commit**

```bash
git add apps/npm-burst/src/server/npm-downloads.ts
git commit -m "feat: add helper to get total weekly downloads for a package"
```

---

### Task 4: Add quota enforcement to `onTrackPackage`

**Files:**
- Modify: `apps/npm-burst/src/server/functions/tracking.telefunc.ts`

**Step 1: Add quota check logic**

Add imports at top of `tracking.telefunc.ts`:

```ts
import { getUserEmails } from '../clerk-utils';
import { getPackageMaintainers, isUserMaintainer } from '../npm-maintainers';
import { getPackageWeeklyDownloads } from '../npm-downloads';
```

Add constants:

```ts
const MAX_TRACKED_PACKAGES = 5;
const WEEKLY_DOWNLOAD_THRESHOLD = 500_000;
```

Modify `onTrackPackage` to add quota checking **after** the auth check and **before** the database insert. The check should:

1. Fetch weekly downloads for the target package
2. If downloads ≥ threshold → skip quota check (large packages are free)
3. Fetch user emails from Clerk
4. Fetch package maintainers from npm registry
5. If user is a maintainer → skip quota check
6. Count the user's existing tracked packages that are under the threshold AND not maintained by user
7. If count ≥ MAX_TRACKED_PACKAGES → throw Abort with descriptive message

Here's the quota check to insert into `onTrackPackage` right after the `isDevMode` early return:

```ts
  const db = getDb(env);

  // --- Quota check ---
  const weeklyDownloads = await getPackageWeeklyDownloads(db, pkg);
  const isLargePackage = weeklyDownloads >= WEEKLY_DOWNLOAD_THRESHOLD;

  if (!isLargePackage) {
    const userEmails = await getUserEmails(userId, env);
    const maintainers = await getPackageMaintainers(db, pkg);
    const isMaintainer = isUserMaintainer(userEmails, maintainers);

    if (!isMaintainer) {
      // Count existing tracked packages that count against quota
      const trackedPkgs = await db
        .selectFrom('tracked_packages as tp')
        .innerJoin('user_tracked_packages as utp', 'tp.id', 'utp.package_id')
        .select('tp.package_name')
        .where('utp.user_id', '=', userId)
        .execute();

      let quotaCount = 0;
      for (const row of trackedPkgs) {
        const dl = await getPackageWeeklyDownloads(db, row.package_name);
        if (dl >= WEEKLY_DOWNLOAD_THRESHOLD) continue;
        const maint = await getPackageMaintainers(db, row.package_name);
        if (isUserMaintainer(userEmails, maint)) continue;
        quotaCount++;
      }

      if (quotaCount >= MAX_TRACKED_PACKAGES) {
        throw Abort({
          reason: 'QUOTA_EXCEEDED',
          message: `You can track up to ${MAX_TRACKED_PACKAGES} packages with under ${(WEEKLY_DOWNLOAD_THRESHOLD / 1000).toFixed(0)}k weekly downloads. Remove a tracked package or track packages you maintain.`,
          currentCount: quotaCount,
          limit: MAX_TRACKED_PACKAGES,
        });
      }
    }
  }

  // --- Existing tracking logic (keep the db insert code that's already here) ---
```

**Important:** Remove the duplicate `const db = getDb(env);` that was previously lower in the function — the quota check already creates it.

**Step 2: Verify the function still works by starting the app**

Run: `npx nx typecheck npm-burst`
Expected: No type errors.

**Step 3: Commit**

```bash
git add apps/npm-burst/src/server/functions/tracking.telefunc.ts
git commit -m "feat: enforce tracking quota (5 packages under 500k downloads, maintainer exempt)"
```

---

### Task 5: Create `onGetUsageInfo` telefunc function

**Files:**
- Create: `apps/npm-burst/src/server/functions/usage.telefunc.ts`

This powers the usage dashboard page with all the info needed.

**Step 1: Write the telefunc function**

```ts
import { Abort, getContext } from 'telefunc';
import { getDb } from '../db';
import { isDevMode } from '../env';
import { getUserEmails } from '../clerk-utils';
import { getPackageMaintainers, isUserMaintainer } from '../npm-maintainers';
import type { NpmMaintainer } from '../npm-maintainers';
import { getPackageWeeklyDownloads } from '../npm-downloads';

const MAX_TRACKED_PACKAGES = 5;
const WEEKLY_DOWNLOAD_THRESHOLD = 500_000;

export interface TrackedPackageInfo {
  packageName: string;
  weeklyDownloads: number;
  isLargePackage: boolean;
  isMaintainer: boolean;
  maintainers: NpmMaintainer[];
  countsAgainstQuota: boolean;
}

export interface UsageInfo {
  trackedPackages: TrackedPackageInfo[];
  quotaUsed: number;
  quotaLimit: number;
  downloadThreshold: number;
  userEmails: string[];
}

export async function onGetUsageInfo(): Promise<UsageInfo> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  if (isDevMode(env)) {
    return {
      trackedPackages: [],
      quotaUsed: 0,
      quotaLimit: MAX_TRACKED_PACKAGES,
      downloadThreshold: WEEKLY_DOWNLOAD_THRESHOLD,
      userEmails: ['dev@example.com'],
    };
  }

  const db = getDb(env);
  const userEmails = await getUserEmails(userId, env);

  const trackedPkgs = await db
    .selectFrom('tracked_packages as tp')
    .innerJoin('user_tracked_packages as utp', 'tp.id', 'utp.package_id')
    .select('tp.package_name')
    .where('utp.user_id', '=', userId)
    .orderBy('tp.package_name')
    .execute();

  const trackedPackages: TrackedPackageInfo[] = [];
  let quotaUsed = 0;

  for (const row of trackedPkgs) {
    const weeklyDownloads = await getPackageWeeklyDownloads(db, row.package_name);
    const isLargePackage = weeklyDownloads >= WEEKLY_DOWNLOAD_THRESHOLD;
    const maintainers = await getPackageMaintainers(db, row.package_name);
    const isMaintainer = isUserMaintainer(userEmails, maintainers);
    const countsAgainstQuota = !isLargePackage && !isMaintainer;

    if (countsAgainstQuota) {
      quotaUsed++;
    }

    trackedPackages.push({
      packageName: row.package_name,
      weeklyDownloads,
      isLargePackage,
      isMaintainer,
      maintainers,
      countsAgainstQuota,
    });
  }

  return {
    trackedPackages,
    quotaUsed,
    quotaLimit: MAX_TRACKED_PACKAGES,
    downloadThreshold: WEEKLY_DOWNLOAD_THRESHOLD,
    userEmails,
  };
}
```

**Step 2: Verify types**

Run: `npx nx typecheck npm-burst`
Expected: No type errors.

**Step 3: Commit**

```bash
git add apps/npm-burst/src/server/functions/usage.telefunc.ts
git commit -m "feat: add onGetUsageInfo telefunc for usage dashboard data"
```

---

### Task 6: Create the `/usage/` Vike page

**Files:**
- Create: `apps/npm-burst/src/pages/usage/+Page.tsx`
- Create: `apps/npm-burst/src/app/usage-page.tsx`
- Create: `apps/npm-burst/src/app/usage-page.module.scss`

This is the main UI work. The page shows:
- A quota usage bar (e.g., "3 / 5 slots used")
- A table of tracked packages with columns: Package, Weekly Downloads, Maintainer Status, Counts Against Quota
- The user's registered emails (for debugging maintainer matching)
- Maintainer emails for each package (expandable, for debugging)

**Step 1: Create the Vike page entry**

Create `apps/npm-burst/src/pages/usage/+Page.tsx`:

```tsx
import { UsagePage } from '../../app/usage-page';

export default function Page() {
  return <UsagePage />;
}
```

**Step 2: Create the usage page component**

Create `apps/npm-burst/src/app/usage-page.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { navigate } from 'vike/client/router';
import { Package, Shield, AlertTriangle, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from './components/card';
import { onGetUsageInfo } from '../server/functions/usage.telefunc';
import type { UsageInfo, TrackedPackageInfo } from '../server/functions/usage.telefunc';
import { useSafeAuth } from './context/auth-context';
import styles from './usage-page.module.scss';

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function QuotaBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min((used / limit) * 100, 100);
  const isFull = used >= limit;

  return (
    <div className={styles.quotaSection}>
      <div className={styles.quotaHeader}>
        <span className={styles.quotaLabel}>Tracking Quota</span>
        <span className={`${styles.quotaCount} ${isFull ? styles.quotaFull : ''}`}>
          {used} / {limit} slots used
        </span>
      </div>
      <div className={styles.quotaBarTrack}>
        <div
          className={`${styles.quotaBarFill} ${isFull ? styles.quotaBarFull : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={styles.quotaHint}>
        Packages with 500k+ weekly downloads and packages you maintain don't count against your quota.
      </p>
    </div>
  );
}

function MaintainerEmails({ maintainers }: { maintainers: TrackedPackageInfo['maintainers'] }) {
  const [expanded, setExpanded] = useState(false);

  if (maintainers.length === 0) return <span className={styles.muted}>None listed</span>;

  return (
    <div>
      <button
        className={styles.expandButton}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {maintainers.length} maintainer{maintainers.length !== 1 ? 's' : ''}
      </button>
      {expanded && (
        <ul className={styles.maintainerList}>
          {maintainers.map((m) => (
            <li key={m.email}>
              <span className={styles.maintainerName}>{m.name}</span>
              <span className={styles.maintainerEmail}>{m.email}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PackageRow({ pkg }: { pkg: TrackedPackageInfo }) {
  const base = import.meta.env.BASE_URL || '/';
  const baseNormalized = base.endsWith('/') ? base : base + '/';
  const packageUrl = `${baseNormalized}package#/${encodeURIComponent(pkg.packageName)}`;

  return (
    <tr className={pkg.countsAgainstQuota ? styles.quotaRow : styles.exemptRow}>
      <td>
        <a href={packageUrl} className={styles.packageLink}>
          <Package size={14} />
          {pkg.packageName}
          <ExternalLink size={12} className={styles.linkIcon} />
        </a>
      </td>
      <td className={styles.dlCell}>{formatDownloads(pkg.weeklyDownloads)}</td>
      <td>
        {pkg.isLargePackage && (
          <span className={styles.badge + ' ' + styles.badgeLarge}>500k+</span>
        )}
        {pkg.isMaintainer && (
          <span className={styles.badge + ' ' + styles.badgeMaintainer}>
            <Shield size={12} /> Maintainer
          </span>
        )}
        {pkg.countsAgainstQuota && (
          <span className={styles.badge + ' ' + styles.badgeQuota}>Counts</span>
        )}
      </td>
      <td>
        <MaintainerEmails maintainers={pkg.maintainers} />
      </td>
    </tr>
  );
}

export function UsagePage() {
  const auth = useSafeAuth();
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isSignedIn) return;
    setLoading(true);
    onGetUsageInfo()
      .then(setUsage)
      .catch((e) => setError(e?.message ?? 'Failed to load usage info'))
      .finally(() => setLoading(false));
  }, [auth.isSignedIn]);

  if (!auth.isLoaded) return null;

  if (!auth.isSignedIn) {
    return (
      <main className={styles.main}>
        <Card>
          <div className={styles.emptyState}>
            <AlertTriangle size={48} color="var(--warning-main, #f5a623)" />
            <h2>Sign in required</h2>
            <p>You need to be signed in to view your usage.</p>
          </div>
        </Card>
      </main>
    );
  }

  if (loading) {
    return (
      <main className={styles.main}>
        <Card>
          <div className={styles.emptyState}>
            <p>Loading usage data...</p>
          </div>
        </Card>
      </main>
    );
  }

  if (error || !usage) {
    return (
      <main className={styles.main}>
        <Card>
          <div className={styles.emptyState}>
            <AlertTriangle size={48} color="var(--error-main, #e53935)" />
            <h2>Error</h2>
            <p>{error ?? 'Failed to load usage info'}</p>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <h1 className={styles.pageTitle}>Usage & Tracking</h1>

      <Card>
        <QuotaBar used={usage.quotaUsed} limit={usage.quotaLimit} />
      </Card>

      <Card>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Your Emails</h2>
          <p className={styles.sectionHint}>
            These emails are checked against package maintainer lists. Add emails in your Clerk profile to match more packages.
          </p>
          <ul className={styles.emailList}>
            {usage.userEmails.map((email) => (
              <li key={email} className={styles.emailItem}>{email}</li>
            ))}
          </ul>
        </div>
      </Card>

      <Card>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Tracked Packages ({usage.trackedPackages.length})
          </h2>
          {usage.trackedPackages.length === 0 ? (
            <p className={styles.muted}>No packages tracked yet.</p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Weekly Downloads</th>
                    <th>Status</th>
                    <th>Maintainers</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.trackedPackages.map((pkg) => (
                    <PackageRow key={pkg.packageName} pkg={pkg} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </main>
  );
}
```

**Step 3: Create the styles**

Create `apps/npm-burst/src/app/usage-page.module.scss`:

```scss
.main {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--spacing-xl) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.pageTitle {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

// Quota bar
.quotaSection {
  padding: var(--spacing-lg);
}

.quotaHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.quotaLabel {
  font-weight: 600;
  color: var(--text-primary);
}

.quotaCount {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-weight: 500;
}

.quotaFull {
  color: var(--error-main, #e53935);
}

.quotaBarTrack {
  height: 8px;
  background: var(--surface-2);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.quotaBarFill {
  height: 100%;
  background: var(--accent-color);
  border-radius: var(--radius-xl);
  transition: width var(--transition-base);
}

.quotaBarFull {
  background: var(--error-main, #e53935);
}

.quotaHint {
  margin: var(--spacing-sm) 0 0;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

// Sections
.section {
  padding: var(--spacing-lg);
}

.sectionTitle {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs);
}

.sectionHint {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  margin: 0 0 var(--spacing-md);
}

// Email list
.emailList {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}

.emailItem {
  background: var(--surface-2);
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  font-family: var(--font-mono, monospace);
}

// Table
.tableWrapper {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);

  th, td {
    text-align: left;
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--surface-2);
  }

  th {
    font-weight: 600;
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
}

.quotaRow {
  td:first-child {
    border-left: 3px solid var(--accent-color);
  }
}

.exemptRow {
  opacity: 0.75;

  td:first-child {
    border-left: 3px solid transparent;
  }
}

.packageLink {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  color: var(--text-primary);
  text-decoration: none;
  font-weight: 500;

  &:hover {
    color: var(--accent-color);
  }
}

.linkIcon {
  opacity: 0;
  transition: opacity var(--transition-fast);

  .packageLink:hover & {
    opacity: 0.6;
  }
}

.dlCell {
  font-family: var(--font-mono, monospace);
  white-space: nowrap;
}

// Badges
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: 500;
  white-space: nowrap;
}

.badgeLarge {
  background: rgba(76, 175, 80, 0.15);
  color: #4caf50;
}

.badgeMaintainer {
  background: rgba(33, 150, 243, 0.15);
  color: #2196f3;
}

.badgeQuota {
  background: rgba(255, 152, 0, 0.15);
  color: #ff9800;
}

// Maintainer expand
.expandButton {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  padding: 2px 0;

  &:hover {
    color: var(--text-primary);
  }
}

.maintainerList {
  list-style: none;
  padding: var(--spacing-xs) 0 0 var(--spacing-md);
  margin: 0;
  font-size: var(--font-size-xs);
}

.maintainerName {
  color: var(--text-primary);
  margin-right: var(--spacing-xs);
}

.maintainerEmail {
  color: var(--text-tertiary);
  font-family: var(--font-mono, monospace);
}

// Empty states
.emptyState {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-xl) var(--spacing-lg);
  text-align: center;

  h2 {
    margin: 0;
    color: var(--text-primary);
  }

  p {
    margin: 0;
    color: var(--text-secondary);
  }
}

.muted {
  color: var(--text-tertiary);
  font-style: italic;
}
```

**Step 4: Verify types**

Run: `npx nx typecheck npm-burst`
Expected: No type errors.

**Step 5: Commit**

```bash
git add apps/npm-burst/src/pages/usage/+Page.tsx apps/npm-burst/src/app/usage-page.tsx apps/npm-burst/src/app/usage-page.module.scss
git commit -m "feat: add usage dashboard page showing tracked packages and quota"
```

---

### Task 7: Add custom UserButton menu item

**Files:**
- Modify: `apps/npm-burst/src/app/components/navbar.tsx`

**Step 1: Add UserButton.Link for usage page**

In `navbar.tsx`, update the `UserButton` to include a custom menu link. Add the `BarChart3` icon import from lucide-react:

```tsx
import { Moon, Sun, BarChart3 } from 'lucide-react';
```

Replace the `<UserButton>` block with:

```tsx
<UserButton
  appearance={{
    elements: {
      avatarBox: styles.avatarBox,
    },
  }}
>
  <UserButton.MenuItems>
    <UserButton.Link
      label="Usage & Tracking"
      labelIcon={<BarChart3 size={16} />}
      href="/usage"
    />
  </UserButton.MenuItems>
</UserButton>
```

Note: The `href` should be relative. If the app uses a `BASE_URL` prefix (e.g., `/npm-burst`), adjust accordingly. Check `import.meta.env.BASE_URL`. If BASE_URL is set, use:

```tsx
href={`${import.meta.env.BASE_URL || '/'}usage`}
```

Make sure the path ends without a trailing slash since Vike's `trailingSlash: true` config will handle the redirect.

**Step 2: Verify types**

Run: `npx nx typecheck npm-burst`
Expected: No type errors.

**Step 3: Commit**

```bash
git add apps/npm-burst/src/app/components/navbar.tsx
git commit -m "feat: add Usage & Tracking link to Clerk UserButton menu"
```

---

### Task 8: Handle quota error in TrackStar component

**Files:**
- Modify: `apps/npm-burst/src/app/components/track-star.tsx`

**Step 1: Show quota error feedback**

When `onTrackPackage` throws with `reason: 'QUOTA_EXCEEDED'`, show a user-friendly message. Update the `handleClick` callback in `TrackStar`:

```tsx
const [quotaError, setQuotaError] = useState<string | null>(null);
```

In the `handleClick` catch block, detect the quota error:

```tsx
const handleClick = useCallback(async () => {
  if (loading) return;
  setLoading(true);
  setQuotaError(null);
  try {
    if (status === 'mine') {
      await onUntrackPackage(packageName);
      setStatus('none');
    } else {
      await onTrackPackage(packageName);
      setStatus('mine');
    }
  } catch (e: any) {
    const abortData = e?.abort;
    if (abortData?.reason === 'QUOTA_EXCEEDED') {
      setQuotaError(abortData.message);
    }
  } finally {
    setLoading(false);
  }
}, [loading, status, packageName]);
```

Add a small error tooltip/popover below the star when `quotaError` is set. Add this after the existing `<Popover>` return, or replace the tooltip content conditionally:

```tsx
const tooltipContent = quotaError ?? tooltips[status];
```

Use the existing `<Popover>` but show quota error with different styling when present:

```tsx
<Popover
  content={
    quotaError ? (
      <span style={{ color: 'var(--error-main, #e53935)' }}>{quotaError}</span>
    ) : (
      <span>{tooltips[status]}</span>
    )
  }
  trigger={quotaError ? 'hover' : 'hover'}
>
```

Clear the error when the component re-renders with a different package:

```tsx
useEffect(() => {
  setQuotaError(null);
}, [packageName]);
```

**Step 2: Verify types**

Run: `npx nx typecheck npm-burst`
Expected: No type errors.

**Step 3: Commit**

```bash
git add apps/npm-burst/src/app/components/track-star.tsx
git commit -m "feat: show quota exceeded error on track star when limit reached"
```

---

### Task 9: Extract shared constants

**Files:**
- Create: `apps/npm-burst/src/server/constants.ts`
- Modify: `apps/npm-burst/src/server/functions/tracking.telefunc.ts` (import from constants)
- Modify: `apps/npm-burst/src/server/functions/usage.telefunc.ts` (import from constants)

**Step 1: Create shared constants file**

```ts
export const MAX_TRACKED_PACKAGES = 5;
export const WEEKLY_DOWNLOAD_THRESHOLD = 500_000;
```

**Step 2: Update tracking.telefunc.ts and usage.telefunc.ts to import from constants**

Replace the inline constants in both files with:

```ts
import { MAX_TRACKED_PACKAGES, WEEKLY_DOWNLOAD_THRESHOLD } from '../constants';
```

Remove the local `const MAX_TRACKED_PACKAGES` and `const WEEKLY_DOWNLOAD_THRESHOLD` lines.

**Step 3: Commit**

```bash
git add apps/npm-burst/src/server/constants.ts apps/npm-burst/src/server/functions/tracking.telefunc.ts apps/npm-burst/src/server/functions/usage.telefunc.ts
git commit -m "refactor: extract tracking constants to shared module"
```

---

### Task 10: Final typecheck and verification

**Step 1: Run full typecheck**

Run: `npx nx typecheck npm-burst`
Expected: No type errors.

**Step 2: Run lint**

Run: `npx nx lint npm-burst`
Expected: No lint errors.

**Step 3: Manual verification checklist**

- [ ] Navigate to `/usage/` when signed in → see quota bar, tracked packages table, user emails
- [ ] Navigate to `/usage/` when signed out → see "Sign in required" message
- [ ] Track a 6th package under 500k downloads → see quota error on star icon
- [ ] Track a package where user is maintainer → it doesn't count against quota
- [ ] Track a package with 500k+ downloads → it doesn't count against quota
- [ ] Click "Usage & Tracking" in UserButton menu → navigates to usage page
- [ ] Expand maintainer emails on usage page → shows name and email for each
- [ ] User emails section shows all Clerk-registered emails

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address any issues from final verification"
```
