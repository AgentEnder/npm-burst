# Implementation Plan: Landing Page + Dashboard Redesign

## Overview

Split the app into two pages:
1. **Index (`/`)** — Marketing landing page with hero search + feature cards
2. **Package (`/package/#/{pkg}`)** — Dashboard with redesigned compact header

Hash-based routing on the package page keeps prerendering viable while allowing dynamic package URLs.

---

## Task 1: Create Package Page Structure & Prerender Config

**Goal:** Set up the `/package/` route with hash-based package name reading.

### Files to create:
- `apps/npm-burst/src/pages/package/+Page.tsx`
- `apps/npm-burst/src/pages/package/+prerender.ts`

### Files to modify:
- `apps/npm-burst/src/app/store/url-sync.ts` — read package name from hash on package page
- `apps/npm-burst/src/app/store/app-store.ts` — update `selectPackage` to navigate

### Details:

**`+prerender.ts`:**
```ts
export default false;
```

**`+Page.tsx`:**
```tsx
import { PackageDashboard } from '../../app/package-dashboard';
export default function Page() {
  return <PackageDashboard />;
}
```

**`package-dashboard.tsx`** (new file at `src/app/package-dashboard.tsx`):
- This is essentially the current `app.tsx` content, refactored
- Reads package name from `window.location.hash` (e.g., `#/nx` → `nx`)
- On hash change, calls `selectPackage`
- Contains: `<Navbar />`, `<DashboardHeader />` (Task 3), chart content, snapshot controls, table

**URL sync changes (`url-sync.ts`):**
- Detect if we're on the package page via `window.location.pathname`
- On package page: read `npmPackageName` from hash (`#/{pkg}`), write other params as hash query params (`#/nx?sortBy=version&lpf=2.00`)
- On other pages: no URL sync (or minimal)
- Update `readInitialStateFromURL()` to parse hash
- Update `pushStateToURL()` to write to hash
- Listen for `hashchange` event instead of `popstate` on package page

**Store changes (`app-store.ts`):**
- `selectPackage()` action: if not already on `/package/`, navigate to `/package/#/{pkg}`. If already on package page, just update hash.
- This means `selectPackage` needs to call `window.location.href = '/npm-burst/package/#/' + pkg` when navigating from landing page, or just update hash when already on package page.

### Verification:
- Navigate to `/package/#/react` → store loads "react"
- Change hash to `#/lodash` → store updates, data refetches
- Browser back/forward works with hash changes
- Prerender still works (the page renders empty shell, hydrates with hash data)

---

## Task 2: Backend — Package Tracking Status Endpoint

**Goal:** Add an endpoint that returns whether a package is tracked by the current user, by other users, or not tracked at all. This powers the 3-state star icon.

### Files to modify:
- `apps/npm-burst/src/server/functions/tracking.telefunc.ts`

### Details:

Add new function `onGetPackageTrackingStatus`:
```ts
export async function onGetPackageTrackingStatus(
  pkg: string
): Promise<{ status: 'mine' | 'others' | 'none' }> {
  const { env, userId } = getContext();

  if (isDevMode(env)) {
    // In dev, treat all fixture packages as "mine" if signed in
    if (userId && devTrackedPackages.has(pkg)) return { status: 'mine' };
    return { status: 'none' };
  }

  const db = getDb(env);

  // Check if package is tracked at all
  const pkgRow = await db
    .selectFrom('tracked_packages as tp')
    .innerJoin('user_tracked_packages as utp', 'tp.id', 'utp.package_id')
    .select(['utp.user_id'])
    .where('tp.package_name', '=', pkg)
    .execute();

  if (pkgRow.length === 0) return { status: 'none' };

  // Check if current user is among trackers
  if (userId && pkgRow.some((r) => r.user_id === userId)) {
    return { status: 'mine' };
  }

  return { status: 'others' };
}
```

### Verification:
- Call with a package you track → returns `'mine'`
- Call with a package someone else tracks → returns `'others'`
- Call with an untracked package → returns `'none'`

---

## Task 3: Dashboard Header Component

**Goal:** Replace the current scattered controls (h1 + input + checkboxes + number input) with a compact, cohesive dashboard toolbar.

### Files to create:
- `apps/npm-burst/src/app/components/dashboard-header.tsx`
- `apps/npm-burst/src/app/components/dashboard-header.module.scss`

### Files to modify:
- `apps/npm-burst/src/app/components/track-button.tsx` → refactor into `TrackStar` icon-only component

### Details:

**Layout (single horizontal bar):**
```
┌─────────────────────────────────────────────────────────────────────┐
│  nx ↗★    │  Sort by version [toggle]  Show table [toggle]  │  LPF: [2] %  │
│  ↑ linked   ↑ star icon                                       ↑ inline      │
│    to npm     w/ tooltip                                        input       │
└─────────────────────────────────────────────────────────────────────┘
```

**Package name section (left):**
- Package name rendered as `<a>` linking to `https://www.npmjs.com/package/{name}`
- Opens in new tab
- Styled as a heading (font-size-xl, font-weight 600) with subtle external link icon (lucide `ExternalLink` at small size)
- `TrackStar` icon immediately after

**TrackStar component (refactored from TrackButton):**
- Icon-only star (no text label)
- Uses `onGetPackageTrackingStatus` from Task 2
- Three visual states:
  - `status === 'none'`: Star outline, `var(--text-disabled)` color. Tooltip: "Track this package"
  - `status === 'others'`: Filled star, grey (`var(--text-tertiary)`). Tooltip: "Tracked by others — click to track for yourself"
  - `status === 'mine'`: Filled star, gold (`#f5a623`). Tooltip: "You're tracking this package — click to untrack"
- Click behavior: same as current TrackButton (toggle track/untrack for current user)
- When not signed in: show nothing (same as current)
- Use the existing `Popover` component with `trigger="hover"` for tooltips

**Toggle switches (middle):**
- Replace native checkboxes with custom CSS toggle switches
- Two toggles: "Sort by version" and "Show table"
- Each is a `<label>` with a hidden checkbox + styled `.toggle-track` / `.toggle-thumb`
- Compact horizontal layout with labels

**Low pass filter (right):**
- Label "LPF" with info icon (existing popover)
- Small inline number input (max-width ~80px)
- Suffix "%" text
- Help text below: "Versions under X% aggregated"

**SCSS styling:**
- Single-row flex container with `align-items: center`
- Subtle bottom border or background (`var(--surface-2)`) to visually separate from chart
- Use existing CSS variables for consistency
- Responsive: stack vertically on mobile (< 768px)
- Smooth transitions on toggle switches

### Verification:
- All controls function identically to current ones
- Star icon shows correct state for tracked/untracked/others-tracked packages
- Tooltips appear on hover
- Toggles animate smoothly
- Layout is responsive on mobile

---

## Task 4: Package Dashboard Page Assembly

**Goal:** Wire up the package dashboard page with the new header component, replacing the old app.tsx layout.

### Files to create:
- `apps/npm-burst/src/app/package-dashboard.tsx`

### Files to modify:
- `apps/npm-burst/src/app/app.tsx` — this file will be significantly reduced or removed. Its dashboard content moves to `package-dashboard.tsx`.
- `apps/npm-burst/src/pages/index/+Page.tsx` — will render the landing page (Task 5) instead of `<App />`

### Details:

**`package-dashboard.tsx`:**
```tsx
export function PackageDashboard() {
  // Read package name from hash
  // Initialize store with hash package
  // usePackageData() for fetching

  return (
    <>
      <Navbar />
      <Card>
        <DashboardHeader />
        {isLoading ? <LoadingSkeleton /> : error ? <ErrorMessage /> : (
          <div className="container-with-table">
            <Sunburst ... />
            <SnapshotControls ... />
            {/* Reset button */}
            <Table ... />
          </div>
        )}
      </Card>
    </>
  );
}
```

- Uses a `useHashPackageName()` hook to read and sync hash → store
- This hook: reads `window.location.hash`, extracts package name, calls `selectPackage` on mount, listens for `hashchange`

### Verification:
- `/package/#/nx` renders the full dashboard for nx
- All existing functionality works (chart, snapshots, table, version selection)
- Hash changes trigger data reload
- Can navigate back to landing page

---

## Task 5: Landing Page — Hero Search with Autocomplete

**Goal:** Create the marketing landing page with a prominent package search that combines tracked packages + npm registry autocomplete.

### Files to create:
- `apps/npm-burst/src/app/components/package-search.tsx`
- `apps/npm-burst/src/app/components/package-search.module.scss`
- `apps/npm-burst/src/app/landing-page.tsx`
- `apps/npm-burst/src/app/landing-page.module.scss`

### Files to modify:
- `apps/npm-burst/src/pages/index/+Page.tsx` — render `<LandingPage />` instead of `<App />`

### Details:

**`package-search.tsx` — Autocomplete component:**

Props:
```ts
interface PackageSearchProps {
  onSelectPackage: (pkg: string) => void;
}
```

Behavior:
1. Centered input with placeholder "Search npm packages..."
2. On typing (debounced ~300ms), fetch from npm registry:
   ```
   https://registry.npmjs.org/-/v1/search?text=${searchText}&size=25
   ```
   Response shape (relevant fields):
   ```ts
   { objects: [{ package: { name: string, description: string, version: string } }] }
   ```
3. If user is signed in, also fetch tracked packages via `onGetTrackedPackages()`
4. Dropdown shows two sections:
   - **"Your tracked packages"** (if signed in and have any matching) — filtered by search text, shown first
   - **"npm packages"** — results from registry search
5. Each result shows: package name (bold) + description (truncated, secondary text) + latest version (tertiary)
6. Tracked packages show a gold star icon
7. Click or Enter on a result → `onSelectPackage(name)` → navigates to `/package/#/{name}`
8. Keyboard navigation: arrow up/down to highlight, Enter to select, Escape to close
9. Click outside closes dropdown

**`landing-page.tsx`:**
```tsx
export function LandingPage() {
  const navigate = (pkg: string) => {
    window.location.href = `${import.meta.env.BASE_URL}package/#/${pkg}`;
  };

  return (
    <>
      <Navbar />
      <main>
        <section className={styles.hero}>
          <h1>Npm Burst</h1>
          <p className={styles.subtitle}>
            Visualize npm package download distributions across versions
          </p>
          <div className={styles.searchContainer}>
            <PackageSearch onSelectPackage={navigate} />
          </div>
        </section>
        <section className={styles.features}>
          <FeatureCard
            icon={<PieChart />}
            title="Version Breakdown"
            description="Interactive sunburst chart showing download distribution across major, minor, and patch versions"
          />
          <FeatureCard
            icon={<History />}
            title="Historical Snapshots"
            description="Track how download patterns change over time with daily snapshots"
          />
          <FeatureCard
            icon={<Star />}
            title="Track Packages"
            description="Sign in to track your favorite packages and get daily download snapshots"
          />
          <FeatureCard
            icon={<Filter />}
            title="Smart Filtering"
            description="Low-pass filter aggregates small versions so you can focus on what matters"
          />
        </section>
      </main>
    </>
  );
}
```

**Hero SCSS:**
- Full viewport height hero section (min-height: 60vh), centered content
- Large title (3xl+), subtle gradient or accent color
- Search box: large, centered, max-width ~600px, prominent shadow, rounded
- Dropdown: absolute positioned below input, same width, elevated shadow

**Feature cards SCSS:**
- CSS Grid, 2 columns on desktop, 1 on mobile
- Each card: icon + title + description, subtle border, rounded corners
- Uses existing surface/shadow variables

### Verification:
- Landing page renders with hero search
- Typing shows autocomplete results from npm registry
- Tracked packages appear in separate group
- Selecting a package navigates to `/package/#/{name}`
- Feature cards render below the fold
- Responsive on mobile

---

## Task 6: Navigation & Integration

**Goal:** Ensure smooth navigation between landing page and dashboard.

### Files to modify:
- `apps/npm-burst/src/app/components/navbar.tsx` — add "Home" link / logo click navigates to `/`
- `apps/npm-burst/src/app/store/app-store.ts` — clean up any index-page-specific logic

### Details:

**Navbar updates:**
- "Npm Burst" title becomes a link to `/npm-burst/` (the base URL + index)
- On dashboard page: show TrackedPackagesMenu (package selection navigates via hash change)
- On landing page: no TrackedPackagesMenu needed (search handles it)
- The `onSelectPackage` prop determines whether we're on dashboard (prop present) or landing (no prop)

**Store cleanup:**
- Remove the package input from dashboard header (package is set via URL hash, not typed in)
- If user wants to search a different package from the dashboard, they go back to landing page or use TrackedPackagesMenu

### Verification:
- Click "Npm Burst" in navbar → goes to landing page
- From landing page, search and select package → goes to dashboard
- TrackedPackagesMenu on dashboard → hash updates, data reloads
- Browser back/forward works between pages

---

## Task 7: Cleanup

**Goal:** Remove dead code and ensure everything is wired up.

### Files to modify/delete:
- `apps/npm-burst/src/app/app.tsx` — can be deleted or reduced to just re-export if still used elsewhere
- `apps/npm-burst/src/app/app.module.scss` — controls styles move to `dashboard-header.module.scss`, rest can be cleaned up
- `apps/npm-burst/src/app/components/track-button.tsx` — keep if `TrackStar` is a separate new component, or refactor in place
- `apps/npm-burst/src/app/components/track-button.module.scss` — update for icon-only styling

### Verification:
- No unused imports or dead code
- `pnpm nx lint npm-burst` passes
- `pnpm nx test npm-burst` passes
- `pnpm nx build npm-burst` succeeds
- Both pages render correctly

---

## Execution Order

Tasks 1-2 can be done in parallel (routing + backend are independent).
Task 3 depends on Task 2 (star icon needs tracking status endpoint).
Task 4 depends on Tasks 1 + 3 (dashboard page needs routing + header).
Task 5 depends on Task 1 (landing page needs routing to exist).
Task 6 depends on Tasks 4 + 5 (navigation ties both pages together).
Task 7 is last (cleanup after everything works).

```
Task 1 (routing) ──┬──→ Task 4 (dashboard assembly) ──┐
                   │                                    ├──→ Task 6 (navigation) → Task 7 (cleanup)
Task 2 (API) ──→ Task 3 (header component) ──┘         │
                                                        │
Task 1 ────────────────→ Task 5 (landing page) ────────┘
```
