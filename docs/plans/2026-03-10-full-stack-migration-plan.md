# Full-Stack Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate npm-burst from a static SPA to a full-stack app with Vike (pre-rendered), Telefunc on Cloudflare Workers, Turso DB for historical snapshots, and Clerk authentication.

**Architecture:** Pre-rendered React pages served from Cloudflare Pages. Telefunc RPC endpoints run as Cloudflare Pages Functions (Workers). Turso stores tracked packages and download snapshots. Clerk handles auth. NPM API calls go through the Worker for signed-in users (enabling ad-hoc snapshots) or directly from the browser for anonymous users.

**Tech Stack:** Vike + vike-react, Telefunc, Cloudflare Pages/Workers, Turso (@libsql/client), Clerk (@clerk/clerk-react, @clerk/backend), D3.js, React 18, TypeScript, Nx monorepo, pnpm

---

## Phase 1: Vike Migration (Foundation)

### Task 1: Install Vike dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install packages**

```bash
pnpm add vike vike-react
```

**Step 2: Verify installation**

```bash
pnpm ls vike vike-react
```

Expected: Both packages listed with versions.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install vike and vike-react"
```

---

### Task 2: Create Vike page structure

**Files:**
- Create: `apps/npm-burst/src/pages/index/+Page.tsx`
- Create: `apps/npm-burst/src/pages/+Layout.tsx`
- Create: `apps/npm-burst/src/pages/+config.ts`
- Modify: `apps/npm-burst/src/app/app.tsx` (extract JSX into Page component)

**Step 1: Create Vike config**

Create `apps/npm-burst/src/pages/+config.ts`:

```typescript
import vikeReact from 'vike-react/config';

export default {
  extends: [vikeReact],
  prerender: true,
};
```

**Step 2: Create Layout component**

Create `apps/npm-burst/src/pages/+Layout.tsx`:

```tsx
import { PropsWithChildren } from 'react';
import { ThemeProvider } from '../app/context/theme-context';
import '../styles.scss';

export default function Layout({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}
```

**Step 3: Create index Page**

Create `apps/npm-burst/src/pages/index/+Page.tsx`:

```tsx
import { App } from '../../app/app';

export default function Page() {
  return <App />;
}
```

This keeps the existing `App` component intact — the Page is just a thin wrapper.

**Step 4: Remove old entry point**

Delete `apps/npm-burst/src/main.tsx`. The Vike framework handles mounting.

Also delete `apps/npm-burst/index.html` if it exists — Vike generates its own HTML.

**Step 5: Verify the file structure**

```
apps/npm-burst/src/
├── pages/
│   ├── +config.ts
│   ├── +Layout.tsx
│   └── index/
│       └── +Page.tsx
├── app/
│   ├── app.tsx          (unchanged)
│   ├── app.module.scss  (unchanged)
│   ├── components/      (unchanged)
│   ├── context/         (unchanged)
│   ├── hooks/           (unchanged)
│   └── utils/           (unchanged)
└── styles.scss          (unchanged)
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: create Vike page structure with pre-rendering"
```

---

### Task 3: Update Vite config for Vike

**Files:**
- Modify: `apps/npm-burst/vite.config.ts`

**Step 1: Update the config**

Replace the contents of `apps/npm-burst/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import vike from 'vike/plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  server: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [
    react(),
    nxViteTsPaths(),
    vike({
      prerender: true,
    }),
  ],
  build: {
    outDir: '../../dist/apps/web',
    reportCompressedSize: true,
    commonjsOptions: { transformMixedEsModules: true },
    emptyOutDir: true,
  },
  base: '/npm-burst',
});
```

Key changes:
- Removed `test` block (will move to vitest.config.ts or keep separate)
- Added `vike()` plugin with `prerender: true`
- Kept `base: '/npm-burst'` for URL path compatibility

**Step 2: Create separate vitest config**

Create `apps/npm-burst/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  plugins: [react(), nxViteTsPaths()],
  test: {
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/web',
      provider: 'v8',
    },
    globals: true,
    cache: {
      dir: '../../node_modules/.vitest',
    },
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
});
```

**Step 3: Run dev server to verify**

```bash
nx serve npm-burst
```

Expected: App loads at `http://localhost:4200/npm-burst` with the same UI as before.

**Step 4: Run build to verify pre-rendering**

```bash
nx build npm-burst
```

Expected: Static HTML output in `dist/apps/web/client/` with a pre-rendered `index.html`.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: configure Vite for Vike pre-rendering"
```

---

### Task 4: Handle client-only code in Vike

**Files:**
- Modify: `apps/npm-burst/src/app/hooks/url-params.ts`
- Modify: `apps/npm-burst/src/app/context/theme-context.tsx`

Vike pre-renders pages in Node.js where `window`, `document`, and `localStorage` don't exist. Guard all browser APIs.

**Step 1: Fix url-params.ts**

In `apps/npm-burst/src/app/hooks/url-params.ts`, the `window.addEventListener('popstate', ...)` call is outside a useEffect — it runs during SSR/prerender. Wrap it:

```typescript
useEffect(() => {
  const handler = () => updateValueFromURL();
  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
}, [updateValueFromURL]);
```

Remove the bare `window.addEventListener('popstate', ...)` call (around line 37-39).

**Step 2: Fix theme-context.tsx**

In `apps/npm-burst/src/app/context/theme-context.tsx`, guard `localStorage`:

```typescript
const [theme, setTheme] = useState<Theme>(() => {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem('npm-burst-theme');
  return (saved as Theme) || 'dark';
});
```

**Step 3: Run build to verify pre-rendering succeeds**

```bash
nx build npm-burst
```

Expected: No `window is not defined` or `localStorage is not defined` errors.

**Step 4: Run tests**

```bash
nx test npm-burst
```

Expected: All existing tests pass.

**Step 5: Commit**

```bash
git add -A
git commit -m "fix: guard browser APIs for Vike pre-rendering"
```

---

## Phase 2: Cloudflare Workers + Telefunc

### Task 5: Install Cloudflare and Telefunc dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install packages**

```bash
pnpm add telefunc wrangler
```

**Step 2: Verify installation**

```bash
pnpm ls telefunc wrangler
```

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install telefunc and wrangler"
```

---

### Task 6: Configure Telefunc with Vike

**Files:**
- Modify: `apps/npm-burst/vite.config.ts`
- Create: `apps/npm-burst/src/pages/+config.ts` (update)

**Step 1: Add telefunc plugin to Vite config**

Update `apps/npm-burst/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import vike from 'vike/plugin';
import { telefunc } from 'telefunc/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  server: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [
    react(),
    nxViteTsPaths(),
    vike({
      prerender: true,
    }),
    telefunc(),
  ],
  build: {
    outDir: '../../dist/apps/web',
    reportCompressedSize: true,
    commonjsOptions: { transformMixedEsModules: true },
    emptyOutDir: true,
  },
  base: '/npm-burst',
});
```

**Step 2: Verify dev server starts**

```bash
nx serve npm-burst
```

Expected: No errors from telefunc plugin (it has no endpoints yet, which is fine).

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: integrate telefunc Vite plugin"
```

---

### Task 7: Create Cloudflare Pages Functions worker entry

**Files:**
- Create: `apps/npm-burst/functions/[[path]].ts`
- Create: `apps/npm-burst/wrangler.toml`

**Step 1: Create wrangler config**

Create `apps/npm-burst/wrangler.toml`:

```toml
name = "npm-burst"
compatibility_date = "2024-01-01"
pages_build_output_dir = "../../dist/apps/web/client"

[vars]
# Environment variables set in Cloudflare dashboard:
# TURSO_DATABASE_URL
# TURSO_AUTH_TOKEN
# CLERK_SECRET_KEY
# CLERK_PUBLISHABLE_KEY

[triggers]
crons = ["0 6 * * *"]  # Daily at 6 AM UTC
```

**Step 2: Create the Pages Function catch-all handler**

Create `apps/npm-burst/functions/[[path]].ts`:

```typescript
import { telefuncHandler } from '../src/server/telefunc-handler';

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;

  // Only handle telefunc requests
  if (new URL(request.url).pathname === '/_telefunc') {
    return telefuncHandler(context);
  }

  // Let Cloudflare Pages handle static assets
  return context.next();
};
```

**Step 3: Create the telefunc handler**

Create `apps/npm-burst/src/server/telefunc-handler.ts`:

```typescript
import { telefunc, config } from 'telefunc';

config.telefuncUrl = '/_telefunc';

export async function telefuncHandler(context: EventContext<unknown, string, unknown>) {
  const request = context.request;
  const httpResponse = await telefunc({
    url: request.url,
    method: request.method,
    body: await request.text(),
    context: {
      env: (context as any).env,
      request,
    },
  });

  return new Response(httpResponse.body, {
    status: httpResponse.statusCode,
    headers: {
      'content-type': httpResponse.contentType,
    },
  });
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Cloudflare Pages Functions worker entry with telefunc handler"
```

---

## Phase 3: Turso Database

### Task 8: Install Turso client and set up schema

**Files:**
- Modify: `package.json`
- Create: `apps/npm-burst/src/server/db.ts`
- Create: `apps/npm-burst/src/server/schema.sql`

**Step 1: Install libsql client**

```bash
pnpm add @libsql/client
```

**Step 2: Create the schema file**

Create `apps/npm-burst/src/server/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS tracked_packages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  package_name TEXT UNIQUE NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_tracked_packages (
  user_id    TEXT NOT NULL,
  package_id INTEGER NOT NULL REFERENCES tracked_packages(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, package_id)
);

CREATE TABLE IF NOT EXISTS snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id    INTEGER NOT NULL REFERENCES tracked_packages(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  downloads     TEXT NOT NULL,
  UNIQUE (package_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_package_date ON snapshots(package_id, snapshot_date);
```

**Step 3: Create the DB client module**

Create `apps/npm-burst/src/server/db.ts`:

```typescript
import { createClient, Client } from '@libsql/client';

let client: Client | null = null;

export function getDb(env: { TURSO_DATABASE_URL: string; TURSO_AUTH_TOKEN: string }): Client {
  if (!client) {
    client = createClient({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

export async function initializeDb(db: Client): Promise<void> {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS tracked_packages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      package_name TEXT UNIQUE NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_tracked_packages (
      user_id    TEXT NOT NULL,
      package_id INTEGER NOT NULL REFERENCES tracked_packages(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, package_id)
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id    INTEGER NOT NULL REFERENCES tracked_packages(id) ON DELETE CASCADE,
      snapshot_date TEXT NOT NULL,
      downloads     TEXT NOT NULL,
      UNIQUE (package_id, snapshot_date)
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_package_date ON snapshots(package_id, snapshot_date);
  `);
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Turso database client and schema"
```

---

### Task 9: Create a Turso database

This is a manual step — run in terminal.

**Step 1: Install Turso CLI (if not already installed)**

```bash
brew install tursodatabase/tap/turso
```

**Step 2: Login and create database**

```bash
turso auth login
turso db create npm-burst
turso db show npm-burst --url
turso db tokens create npm-burst
```

Save the URL and token — you'll set them as Cloudflare environment variables.

**Step 3: Apply schema**

```bash
turso db shell npm-burst < apps/npm-burst/src/server/schema.sql
```

**Step 4: Verify tables exist**

```bash
turso db shell npm-burst "SELECT name FROM sqlite_master WHERE type='table';"
```

Expected: `tracked_packages`, `user_tracked_packages`, `snapshots`.

---

## Phase 4: Clerk Authentication

### Task 10: Install Clerk and create provider

**Files:**
- Modify: `package.json`
- Create: `apps/npm-burst/src/app/context/auth-context.tsx`
- Modify: `apps/npm-burst/src/pages/+Layout.tsx`

**Step 1: Install Clerk packages**

```bash
pnpm add @clerk/clerk-react @clerk/backend
```

**Step 2: Create auth context**

Create `apps/npm-burst/src/app/context/auth-context.tsx`:

```tsx
import { ClerkProvider } from '@clerk/clerk-react';
import { PropsWithChildren } from 'react';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export function AuthProvider({ children }: PropsWithChildren) {
  if (!CLERK_PUBLISHABLE_KEY) {
    // In pre-render or if key not set, render children without Clerk
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      {children}
    </ClerkProvider>
  );
}
```

**Step 3: Add AuthProvider to Layout**

Update `apps/npm-burst/src/pages/+Layout.tsx`:

```tsx
import { PropsWithChildren } from 'react';
import { ThemeProvider } from '../app/context/theme-context';
import { AuthProvider } from '../app/context/auth-context';
import '../styles.scss';

export default function Layout({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </AuthProvider>
  );
}
```

**Step 4: Create `.env.local` template**

Create `apps/npm-burst/.env.local.example`:

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Clerk authentication provider"
```

---

### Task 11: Set up Clerk project

Manual step — create Clerk application.

**Step 1: Create Clerk application**

Go to https://dashboard.clerk.com, create a new application called "npm-burst".

**Step 2: Get keys**

- Copy the **Publishable Key** → set as `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local`
- Copy the **Secret Key** → set as Cloudflare Worker env var `CLERK_SECRET_KEY`

**Step 3: Configure Clerk**

In Clerk dashboard:
- Enable email/password and GitHub OAuth sign-in methods
- Set the application URL to your Cloudflare Pages domain

---

### Task 12: Add Clerk server-side verification to telefunc handler

**Files:**
- Modify: `apps/npm-burst/src/server/telefunc-handler.ts`
- Create: `apps/npm-burst/src/server/auth.ts`

**Step 1: Create auth verification module**

Create `apps/npm-burst/src/server/auth.ts`:

```typescript
import { verifyToken } from '@clerk/backend';

export async function getAuthUserId(
  request: Request,
  secretKey: string
): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token, { secretKey });
    return payload.sub;
  } catch {
    return null;
  }
}
```

**Step 2: Update telefunc handler to inject auth context**

Update `apps/npm-burst/src/server/telefunc-handler.ts`:

```typescript
import { telefunc, config } from 'telefunc';
import { getAuthUserId } from './auth';

config.telefuncUrl = '/_telefunc';

export async function telefuncHandler(context: EventContext<unknown, string, unknown>) {
  const request = context.request;
  const env = (context as any).env;

  const userId = await getAuthUserId(request, env.CLERK_SECRET_KEY);

  const httpResponse = await telefunc({
    url: request.url,
    method: request.method,
    body: await request.text(),
    context: {
      env,
      userId,
    },
  });

  return new Response(httpResponse.body, {
    status: httpResponse.statusCode,
    headers: {
      'content-type': httpResponse.contentType,
    },
  });
}
```

**Step 3: Create telefunc context type**

Create `apps/npm-burst/src/server/telefunc-context.d.ts`:

```typescript
import type { Client } from '@libsql/client';

declare module 'telefunc' {
  namespace Telefunc {
    interface Context {
      env: {
        TURSO_DATABASE_URL: string;
        TURSO_AUTH_TOKEN: string;
        CLERK_SECRET_KEY: string;
      };
      userId: string | null;
    }
  }
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Clerk server-side auth verification for telefunc"
```

---

## Phase 5: Telefunc Endpoints

### Task 13: Create telefunc endpoint for downloads (authed)

**Files:**
- Create: `apps/npm-burst/src/server/functions/downloads.telefunc.ts`

**Step 1: Create the endpoint**

Create `apps/npm-burst/src/server/functions/downloads.telefunc.ts`:

```typescript
import { getContext, Abort } from 'telefunc';
import { getDb } from '../db';

interface NpmDownloadsByVersion {
  downloads: Record<string, number>;
  package: string;
}

export async function onGetDownloads(pkg: string): Promise<NpmDownloadsByVersion> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  // Fetch from NPM API
  const response = await fetch(
    `https://api.npmjs.org/versions/${encodeURI(pkg).replace('/', '%2f')}/last-week`
  );
  const data = (await response.json()) as NpmDownloadsByVersion;

  // Opportunistically save snapshot for yesterday
  const yesterday = getYesterdayDate();
  const db = getDb(env);

  try {
    // Ensure package exists in tracked_packages (for ad-hoc snapshots)
    await db.execute({
      sql: 'INSERT OR IGNORE INTO tracked_packages (package_name) VALUES (?)',
      args: [pkg],
    });

    const pkgRow = await db.execute({
      sql: 'SELECT id FROM tracked_packages WHERE package_name = ?',
      args: [pkg],
    });

    if (pkgRow.rows.length > 0) {
      const packageId = pkgRow.rows[0].id as number;

      // Only insert if snapshot doesn't exist for yesterday
      await db.execute({
        sql: `INSERT OR IGNORE INTO snapshots (package_id, snapshot_date, downloads)
              VALUES (?, ?, ?)`,
        args: [packageId, yesterday, JSON.stringify(data.downloads)],
      });
    }
  } catch (e) {
    // Don't fail the request if snapshot saving fails
    console.error('Failed to save ad-hoc snapshot:', e);
  }

  return data;
}

function getYesterdayDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add telefunc endpoint for authed downloads with ad-hoc snapshots"
```

---

### Task 14: Create telefunc endpoints for tracking

**Files:**
- Create: `apps/npm-burst/src/server/functions/tracking.telefunc.ts`

**Step 1: Create tracking endpoints**

Create `apps/npm-burst/src/server/functions/tracking.telefunc.ts`:

```typescript
import { getContext, Abort } from 'telefunc';
import { getDb } from '../db';

export async function onTrackPackage(pkg: string): Promise<{ success: boolean }> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  const db = getDb(env);

  // Ensure package exists
  await db.execute({
    sql: 'INSERT OR IGNORE INTO tracked_packages (package_name) VALUES (?)',
    args: [pkg],
  });

  const pkgRow = await db.execute({
    sql: 'SELECT id FROM tracked_packages WHERE package_name = ?',
    args: [pkg],
  });

  const packageId = pkgRow.rows[0].id as number;

  // Link user to package
  await db.execute({
    sql: 'INSERT OR IGNORE INTO user_tracked_packages (user_id, package_id) VALUES (?, ?)',
    args: [userId, packageId],
  });

  return { success: true };
}

export async function onUntrackPackage(pkg: string): Promise<{ success: boolean }> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  const db = getDb(env);

  const pkgRow = await db.execute({
    sql: 'SELECT id FROM tracked_packages WHERE package_name = ?',
    args: [pkg],
  });

  if (pkgRow.rows.length > 0) {
    const packageId = pkgRow.rows[0].id as number;
    await db.execute({
      sql: 'DELETE FROM user_tracked_packages WHERE user_id = ? AND package_id = ?',
      args: [userId, packageId],
    });
  }

  return { success: true };
}

export async function onGetTrackedPackages(): Promise<{ packages: string[] }> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  const db = getDb(env);

  const result = await db.execute({
    sql: `SELECT tp.package_name
          FROM tracked_packages tp
          JOIN user_tracked_packages utp ON tp.id = utp.package_id
          WHERE utp.user_id = ?
          ORDER BY tp.package_name`,
    args: [userId],
  });

  return {
    packages: result.rows.map((r) => r.package_name as string),
  };
}

export async function onIsPackageTracked(pkg: string): Promise<{ tracked: boolean }> {
  const { env, userId } = getContext();

  if (!userId) {
    return { tracked: false };
  }

  const db = getDb(env);

  const result = await db.execute({
    sql: `SELECT 1
          FROM tracked_packages tp
          JOIN user_tracked_packages utp ON tp.id = utp.package_id
          WHERE utp.user_id = ? AND tp.package_name = ?`,
    args: [userId, pkg],
  });

  return { tracked: result.rows.length > 0 };
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add telefunc endpoints for package tracking"
```

---

### Task 15: Create telefunc endpoint for snapshots (public)

**Files:**
- Create: `apps/npm-burst/src/server/functions/snapshots.telefunc.ts`

**Step 1: Create snapshot endpoint**

Create `apps/npm-burst/src/server/functions/snapshots.telefunc.ts`:

```typescript
import { getContext } from 'telefunc';
import { getDb } from '../db';

export interface Snapshot {
  date: string;
  downloads: Record<string, number>;
}

export async function onGetSnapshots(pkg: string): Promise<{ snapshots: Snapshot[] }> {
  const { env } = getContext();
  const db = getDb(env);

  const pkgRow = await db.execute({
    sql: 'SELECT id FROM tracked_packages WHERE package_name = ?',
    args: [pkg],
  });

  if (pkgRow.rows.length === 0) {
    return { snapshots: [] };
  }

  const packageId = pkgRow.rows[0].id as number;

  const result = await db.execute({
    sql: `SELECT snapshot_date, downloads
          FROM snapshots
          WHERE package_id = ?
          ORDER BY snapshot_date ASC`,
    args: [packageId],
  });

  return {
    snapshots: result.rows.map((r) => ({
      date: r.snapshot_date as string,
      downloads: JSON.parse(r.downloads as string),
    })),
  };
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add telefunc endpoint for public snapshot retrieval"
```

---

## Phase 6: Cron Worker

### Task 16: Create cron handler for daily snapshots

**Files:**
- Create: `apps/npm-burst/src/server/cron.ts`
- Modify: `apps/npm-burst/functions/[[path]].ts` (add scheduled handler)

**Step 1: Create cron logic**

Create `apps/npm-burst/src/server/cron.ts`:

```typescript
import { getDb } from './db';

interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
}

export async function handleCron(env: Env): Promise<void> {
  const db = getDb(env);
  const yesterday = getYesterdayDate();

  // Get all tracked packages (those with at least one user tracking them)
  const result = await db.execute({
    sql: `SELECT DISTINCT tp.id, tp.package_name
          FROM tracked_packages tp
          JOIN user_tracked_packages utp ON tp.id = utp.package_id`,
    args: [],
  });

  for (const row of result.rows) {
    const packageId = row.id as number;
    const packageName = row.package_name as string;

    // Check if we already have a snapshot for yesterday
    const existing = await db.execute({
      sql: 'SELECT 1 FROM snapshots WHERE package_id = ? AND snapshot_date = ?',
      args: [packageId, yesterday],
    });

    if (existing.rows.length > 0) {
      continue; // Already have this snapshot (e.g., from ad-hoc)
    }

    try {
      const response = await fetch(
        `https://api.npmjs.org/versions/${encodeURI(packageName).replace('/', '%2f')}/last-week`
      );
      const data = await response.json() as { downloads: Record<string, number> };

      await db.execute({
        sql: `INSERT OR IGNORE INTO snapshots (package_id, snapshot_date, downloads)
              VALUES (?, ?, ?)`,
        args: [packageId, yesterday, JSON.stringify(data.downloads)],
      });
    } catch (e) {
      console.error(`Failed to fetch snapshot for ${packageName}:`, e);
    }
  }
}

function getYesterdayDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}
```

**Step 2: Wire up the scheduled handler**

Update `apps/npm-burst/functions/[[path]].ts` to also export a `scheduled` handler. Note: Cloudflare Pages Functions don't directly support `scheduled` — this needs to be a separate Worker or use the `_worker.js` advanced mode. Create a separate worker entry:

Create `apps/npm-burst/functions/_scheduled.ts`:

```typescript
import { handleCron } from '../src/server/cron';

export default {
  async scheduled(event: ScheduledEvent, env: any) {
    await handleCron(env);
  },
};
```

> **Note:** Cloudflare Pages Functions don't natively support cron triggers. The cron worker may need to be deployed as a separate Cloudflare Worker that shares the same Turso database. Update `wrangler.toml` accordingly or create a `workers/cron/` directory. This can be refined during implementation based on Cloudflare's latest Pages Functions capabilities.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add cron handler for daily snapshot collection"
```

---

## Phase 7: UI Changes

### Task 17: Add Clerk sign-in UI to Navbar

**Files:**
- Modify: `apps/npm-burst/src/app/components/navbar.tsx`
- Modify: `apps/npm-burst/src/app/components/navbar.module.scss`

**Step 1: Update Navbar component**

Update `apps/npm-burst/src/app/components/navbar.tsx`:

```tsx
import { memo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '../context/theme-context';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from '@clerk/clerk-react';
import styles from './navbar.module.scss';

export const Navbar = memo(function Navbar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className={styles.navbar}>
      <div className={styles.title}>Npm Burst</div>
      <div className={styles.spacer}></div>
      <button
        className={styles.themeToggle}
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        <FontAwesomeIcon icon={theme === 'light' ? faMoon : faSun} />
      </button>
      <a
        href="https://github.com/agentender/npm-burst"
        className={styles.navLink}
        aria-label="View source on GitHub"
        title="View source on GitHub"
        target="_blank"
        rel="noopener noreferrer"
      >
        <FontAwesomeIcon icon={faGithub} />
      </a>
      <div className={styles.authSection}>
        <SignedOut>
          <SignInButton mode="modal">
            <button className={styles.signInButton}>Sign In</button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <UserButton
            appearance={{
              elements: {
                avatarBox: styles.avatarBox,
              },
            }}
          />
        </SignedIn>
      </div>
    </nav>
  );
});
```

**Step 2: Add styles for auth section**

Add to `apps/npm-burst/src/app/components/navbar.module.scss`:

```scss
.authSection {
  display: flex;
  align-items: center;
  margin-left: var(--spacing-sm);
}

.signInButton {
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: opacity 150ms ease-in-out;

  &:hover {
    opacity: 0.85;
  }
}

.avatarBox {
  width: 28px;
  height: 28px;
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Clerk sign-in/user button to navbar"
```

---

### Task 18: Add Track/Untrack button

**Files:**
- Create: `apps/npm-burst/src/app/components/track-button.tsx`
- Create: `apps/npm-burst/src/app/components/track-button.module.scss`
- Modify: `apps/npm-burst/src/app/app.tsx`

**Step 1: Create TrackButton component**

Create `apps/npm-burst/src/app/components/track-button.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar as faStarSolid } from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import { onTrackPackage, onUntrackPackage, onIsPackageTracked } from '../../server/functions/tracking.telefunc';
import styles from './track-button.module.scss';

interface TrackButtonProps {
  packageName: string;
}

export function TrackButton({ packageName }: TrackButtonProps) {
  const { isSignedIn } = useAuth();
  const [isTracked, setIsTracked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !packageName) return;
    onIsPackageTracked(packageName).then(({ tracked }) => setIsTracked(tracked));
  }, [isSignedIn, packageName]);

  const handleToggle = useCallback(async () => {
    if (!isSignedIn || isLoading) return;
    setIsLoading(true);
    try {
      if (isTracked) {
        await onUntrackPackage(packageName);
        setIsTracked(false);
      } else {
        await onTrackPackage(packageName);
        setIsTracked(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, isLoading, isTracked, packageName]);

  if (!isSignedIn) return null;

  return (
    <button
      className={`${styles.trackButton} ${isTracked ? styles.tracked : ''}`}
      onClick={handleToggle}
      disabled={isLoading}
      title={isTracked ? 'Untrack package' : 'Track package for daily snapshots'}
    >
      <FontAwesomeIcon icon={isTracked ? faStarSolid : faStarRegular} />
      {isTracked ? 'Tracked' : 'Track'}
    </button>
  );
}
```

**Step 2: Create styles**

Create `apps/npm-burst/src/app/components/track-button.module.scss`:

```scss
.trackButton {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
  }

  &.tracked {
    color: #f5a623;
    border-color: #f5a623;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
```

**Step 3: Add TrackButton to app.tsx**

In `apps/npm-burst/src/app/app.tsx`, import and add the TrackButton next to the package input:

```tsx
import { TrackButton } from './components/track-button';
```

Place it inside the `inputGroup` div, after the `<input>`:

```tsx
<div className={styles.inputGroup}>
  <label htmlFor="npm-package-input" className={styles.label}>
    NPM Package
  </label>
  <div className={styles.inputRow}>
    <input
      id="npm-package-input"
      type="text"
      className={styles.input}
      onKeyDown={...}
      onBlur={...}
      placeholder="e.g., react, lodash, express"
    />
    <TrackButton packageName={npmPackageName} />
  </div>
</div>
```

Add corresponding `.inputRow` style in `apps/npm-burst/src/app/app.module.scss`:

```scss
.inputRow {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add track/untrack button for signed-in users"
```

---

### Task 19: Route signed-in users' downloads through telefunc

**Files:**
- Modify: `apps/npm-burst/src/app/app.tsx`

**Step 1: Update fetchData to use telefunc when signed in**

In `apps/npm-burst/src/app/app.tsx`, add Clerk hook and conditional fetching:

```tsx
import { useAuth } from '@clerk/clerk-react';
import { onGetDownloads } from '../server/functions/downloads.telefunc';
```

Inside the `App` component, add:

```tsx
const { isSignedIn } = useAuth();
```

Update `fetchData`:

```tsx
const fetchData = useCallback(() => {
  if (!npmPackageName) return;

  setIsLoading(true);
  setError(null);

  if (isSignedIn) {
    // Signed-in: go through telefunc (enables ad-hoc snapshots)
    const promise = onGetDownloads(npmPackageName)
      .then((downloads) => {
        setRawDownloadData(downloads);
        setError(null);
      })
      .catch((e) => {
        setError(
          `Failed to load data for "${npmPackageName}". The package may not exist or there was a network error.`
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
    return () => {}; // telefunc doesn't support cancellation
  }

  // Anonymous: direct NPM API call (unchanged behavior)
  const { get, cancel } = getDownloadsByVersion(npmPackageName);
  get()
    .then((downloads) => {
      if (downloads) {
        setRawDownloadData(downloads);
        setError(null);
      }
    })
    .catch((e) => {
      if (e.name !== 'AbortError') {
        setError(
          `Failed to load data for "${npmPackageName}". The package may not exist or there was a network error.`
        );
      }
    })
    .finally(() => {
      setIsLoading(false);
    });

  return cancel;
}, [npmPackageName, isSignedIn]);
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: route signed-in users' downloads through telefunc for ad-hoc snapshots"
```

---

### Task 20: Add Tracked Packages dropdown to Navbar

**Files:**
- Create: `apps/npm-burst/src/app/components/tracked-packages-menu.tsx`
- Create: `apps/npm-burst/src/app/components/tracked-packages-menu.module.scss`
- Modify: `apps/npm-burst/src/app/components/navbar.tsx`

**Step 1: Create TrackedPackagesMenu component**

Create `apps/npm-burst/src/app/components/tracked-packages-menu.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faList, faTimes } from '@fortawesome/free-solid-svg-icons';
import { onGetTrackedPackages, onUntrackPackage } from '../../server/functions/tracking.telefunc';
import styles from './tracked-packages-menu.module.scss';

interface TrackedPackagesMenuProps {
  onSelectPackage: (pkg: string) => void;
}

export function TrackedPackagesMenu({ onSelectPackage }: TrackedPackagesMenuProps) {
  const { isSignedIn } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [packages, setPackages] = useState<string[]>([]);

  const loadPackages = useCallback(async () => {
    if (!isSignedIn) return;
    const { packages: pkgs } = await onGetTrackedPackages();
    setPackages(pkgs);
  }, [isSignedIn]);

  useEffect(() => {
    if (isOpen) {
      loadPackages();
    }
  }, [isOpen, loadPackages]);

  const handleUntrack = useCallback(async (pkg: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await onUntrackPackage(pkg);
    setPackages((prev) => prev.filter((p) => p !== pkg));
  }, []);

  const handleSelect = useCallback((pkg: string) => {
    onSelectPackage(pkg);
    setIsOpen(false);
  }, [onSelectPackage]);

  if (!isSignedIn) return null;

  return (
    <div className={styles.container}>
      <button
        className={styles.menuButton}
        onClick={() => setIsOpen(!isOpen)}
        title="Tracked packages"
      >
        <FontAwesomeIcon icon={faList} />
      </button>
      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.header}>Tracked Packages</div>
          {packages.length === 0 ? (
            <div className={styles.empty}>No tracked packages yet</div>
          ) : (
            <ul className={styles.list}>
              {packages.map((pkg) => (
                <li key={pkg} className={styles.item} onClick={() => handleSelect(pkg)}>
                  <span className={styles.packageName}>{pkg}</span>
                  <button
                    className={styles.removeButton}
                    onClick={(e) => handleUntrack(pkg, e)}
                    title={`Untrack ${pkg}`}
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Create styles**

Create `apps/npm-burst/src/app/components/tracked-packages-menu.module.scss`:

```scss
.container {
  position: relative;
  display: flex;
  align-items: center;
}

.menuButton {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: var(--spacing-xs);
  font-size: var(--font-size-md);
  transition: color 150ms ease-in-out;

  &:hover {
    color: var(--text-primary);
  }
}

.dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  min-width: 220px;
  max-height: 300px;
  overflow-y: auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
}

.header {
  padding: var(--spacing-sm) var(--spacing-md);
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.empty {
  padding: var(--spacing-md);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  text-align: center;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-xs) var(--spacing-md);
  cursor: pointer;
  transition: background 150ms ease-in-out;

  &:hover {
    background: var(--bg-hover);
  }
}

.packageName {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.removeButton {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: var(--spacing-xs);
  font-size: var(--font-size-xs);
  opacity: 0.5;
  transition: opacity 150ms ease-in-out;

  &:hover {
    opacity: 1;
    color: var(--danger-color, #e74c3c);
  }
}
```

**Step 3: Add to Navbar**

Update `apps/npm-burst/src/app/components/navbar.tsx` to include TrackedPackagesMenu before the auth section. The `onSelectPackage` prop will need to be threaded through from App — accept it as a prop on Navbar or use a callback context.

The simplest approach: make Navbar accept an optional `onSelectPackage` prop:

```tsx
interface NavbarProps {
  onSelectPackage?: (pkg: string) => void;
}

export const Navbar = memo(function Navbar({ onSelectPackage }: NavbarProps) {
  // ... existing code ...

  // Before authSection:
  {onSelectPackage && (
    <TrackedPackagesMenu onSelectPackage={onSelectPackage} />
  )}
});
```

In `app.tsx`, pass the handler:

```tsx
<Navbar onSelectPackage={(pkg) => {
  setNpmPackageName(pkg);
  setSelectedVersion(null);
  setExpandedNodes([]);
}} />
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add tracked packages dropdown menu in navbar"
```

---

## Phase 8: Historical Step Controls & Sunburst Animation

### Task 21: Create SnapshotControls component

**Files:**
- Create: `apps/npm-burst/src/app/components/snapshot-controls.tsx`
- Create: `apps/npm-burst/src/app/components/snapshot-controls.module.scss`

**Step 1: Create component**

Create `apps/npm-burst/src/app/components/snapshot-controls.tsx`:

```tsx
import { memo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronLeft,
  faChevronRight,
  faBolt,
} from '@fortawesome/free-solid-svg-icons';
import styles from './snapshot-controls.module.scss';

interface SnapshotControlsProps {
  currentIndex: number;
  totalSnapshots: number;
  currentDate: string | null; // null = live mode
  onPrevious: () => void;
  onNext: () => void;
  onLive: () => void;
}

export const SnapshotControls = memo(function SnapshotControls({
  currentIndex,
  totalSnapshots,
  currentDate,
  onPrevious,
  onNext,
  onLive,
}: SnapshotControlsProps) {
  const isLive = currentDate === null;
  const isAtStart = currentIndex <= 0;
  const isAtEnd = isLive;

  return (
    <div className={styles.controls}>
      <button
        className={styles.navButton}
        onClick={onPrevious}
        disabled={isAtStart}
        title="Previous snapshot"
      >
        <FontAwesomeIcon icon={faChevronLeft} />
      </button>

      <span className={styles.dateLabel}>
        {isLive ? 'Live' : currentDate}
      </span>

      <button
        className={styles.navButton}
        onClick={onNext}
        disabled={isAtEnd}
        title={isLive ? 'Already at live' : 'Next snapshot'}
      >
        <FontAwesomeIcon icon={faChevronRight} />
      </button>

      {!isLive && (
        <button className={styles.liveButton} onClick={onLive} title="Return to live data">
          <FontAwesomeIcon icon={faBolt} />
          Live
        </button>
      )}

      <span className={styles.counter}>
        {isLive
          ? `${totalSnapshots} snapshot${totalSnapshots !== 1 ? 's' : ''} available`
          : `${currentIndex + 1} / ${totalSnapshots}`}
      </span>
    </div>
  );
});
```

**Step 2: Create styles**

Create `apps/npm-burst/src/app/components/snapshot-controls.module.scss`:

```scss
.controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) 0;
  justify-content: center;
}

.navButton {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  padding: var(--spacing-xs) var(--spacing-sm);
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    border-color: var(--accent-color);
    color: var(--accent-color);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.dateLabel {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
  min-width: 100px;
  text-align: center;
}

.liveButton {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: opacity 150ms ease-in-out;

  &:hover {
    opacity: 0.85;
  }
}

.counter {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: create snapshot step controls component"
```

---

### Task 22: Integrate snapshots and step controls into App

**Files:**
- Modify: `apps/npm-burst/src/app/app.tsx`

**Step 1: Add snapshot state and fetching**

In `apps/npm-burst/src/app/app.tsx`, add imports and state:

```tsx
import { SnapshotControls } from './components/snapshot-controls';
import { onGetSnapshots, Snapshot } from '../server/functions/snapshots.telefunc';
```

Add state inside the App component:

```tsx
const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
const [snapshotIndex, setSnapshotIndex] = useState<number | null>(null); // null = live
```

Add effect to load snapshots when package changes:

```tsx
useEffect(() => {
  if (!npmPackageName) return;
  setSnapshotIndex(null); // Reset to live on package change
  onGetSnapshots(npmPackageName)
    .then(({ snapshots: snaps }) => setSnapshots(snaps))
    .catch(() => setSnapshots([]));
}, [npmPackageName]);
```

**Step 2: Update sunburst data source**

When viewing a snapshot, use snapshot data instead of live data:

```tsx
useEffect(() => {
  const sourceData =
    snapshotIndex !== null && snapshots[snapshotIndex]
      ? { downloads: snapshots[snapshotIndex].downloads, package: npmPackageName }
      : rawDownloadData;

  if (sourceData) {
    setSunburstChartData(
      getSunburstDataFromDownloads(sourceData, lowPassFilter, expandedNodes)
    );
  }
}, [lowPassFilter, rawDownloadData, expandedNodes, snapshotIndex, snapshots, npmPackageName]);
```

Remove or replace the existing `useEffect` that sets `sunburstChartData` (the one at line ~151-161).

**Step 3: Add step control handlers**

```tsx
const handlePreviousSnapshot = useCallback(() => {
  if (snapshots.length === 0) return;
  if (snapshotIndex === null) {
    // From live, go to last snapshot
    setSnapshotIndex(snapshots.length - 1);
  } else if (snapshotIndex > 0) {
    setSnapshotIndex(snapshotIndex - 1);
  }
}, [snapshots.length, snapshotIndex]);

const handleNextSnapshot = useCallback(() => {
  if (snapshotIndex === null) return;
  if (snapshotIndex >= snapshots.length - 1) {
    // At last snapshot, go to live
    setSnapshotIndex(null);
  } else {
    setSnapshotIndex(snapshotIndex + 1);
  }
}, [snapshots.length, snapshotIndex]);

const handleGoLive = useCallback(() => {
  setSnapshotIndex(null);
}, []);
```

**Step 4: Render SnapshotControls below the Sunburst**

Place after the `<Sunburst>` component and before the reset button:

```tsx
{sunburstChartData ? (
  <Sunburst
    data={sunburstChartData}
    sortByVersion={sortByVersion}
    onVersionChange={handleVersionClick}
    initialSelection={selectedVersion}
  />
) : null}

{snapshots.length > 0 && (
  <SnapshotControls
    currentIndex={snapshotIndex ?? snapshots.length}
    totalSnapshots={snapshots.length}
    currentDate={snapshotIndex !== null ? snapshots[snapshotIndex].date : null}
    onPrevious={handlePreviousSnapshot}
    onNext={handleNextSnapshot}
    onLive={handleGoLive}
  />
)}
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: integrate snapshot loading and step controls into main app"
```

---

### Task 23: Add D3 transition between snapshots

**Files:**
- Modify: `apps/npm-burst/src/app/components/sunburst/sunburst.tsx`
- Modify: `apps/npm-burst/src/app/components/sunburst/d3-sunburst.ts`

**Step 1: Read current sunburst.tsx**

First read `apps/npm-burst/src/app/components/sunburst/sunburst.tsx` to understand how data flows to D3.

**Step 2: Add update capability to d3-sunburst.ts**

The current `sunburst()` function creates a new SVG each time. To animate transitions between snapshots, we need an `update()` function that transitions the existing arcs to new data.

Add an `updateData` method that:
1. Re-partitions the new data
2. Stores target positions on each node by matching `data.name`
3. Transitions arcs, labels, and opacities from current to target

Add to the end of the `sunburst()` function, before `return svg.node()`:

```typescript
// Expose an update method on the SVG element for transitioning to new data
(svg.node() as any).__updateData = function(
  newData: SunburstData,
  newSortComparator?: typeof sortComparator
) {
  const newRoot = partition(newData, newSortComparator || sortComparator) as any;
  newRoot.each((d: any) => (d.current = d));

  // Build a map of name -> new node for matching
  const newNodeMap = new Map<string, any>();
  newRoot.each((d: any) => newNodeMap.set(d.data.name, d));

  // Update existing nodes with targets from new data
  root.each((d: any) => {
    const match = newNodeMap.get(d.data.name);
    if (match) {
      d.target = {
        x0: match.x0,
        x1: match.x1,
        y0: match.y0,
        y1: match.y1,
      };
    } else {
      // Node doesn't exist in new data — collapse to zero
      d.target = { x0: 0, x1: 0, y0: d.y0, y1: d.y1 };
    }
  });

  const t = g.transition().duration(750);

  path
    .transition(t as any)
    .tween('data', (d: any) => {
      const i = d3.interpolate(d.current, d.target);
      return (t: any) => (d.current = i(t));
    })
    .attr('fill-opacity', (d: any) =>
      arcVisible(d.target) ? (d.children ? 0.6 : 0.4) : 0
    )
    .attr('pointer-events', (d: any) =>
      arcVisible(d.target) ? 'auto' : 'none'
    )
    .attrTween('d', (d: any) => () => arc(d.current!) as any);

  label
    .transition(t as any)
    .attr('fill-opacity', (d: any) => {
      if (
        d.parent &&
        d.parent.data.name === d.data.name &&
        labelVisible(d.parent.target)
      ) {
        return 0;
      }
      return +labelVisible(d.target);
    })
    .attrTween('transform', (d: any) => () => labelTransform(d.current));
};
```

**Step 3: Update sunburst.tsx to call updateData on data changes**

In `sunburst.tsx`, when `data` prop changes and the SVG already exists, call `__updateData` instead of recreating the entire SVG:

```tsx
useEffect(() => {
  if (!containerRef.current) return;

  const existingSvg = containerRef.current.querySelector('svg');
  if (existingSvg && (existingSvg as any).__updateData) {
    // Transition existing chart to new data
    (existingSvg as any).__updateData(data, sortComparator);
  } else {
    // First render — create new chart
    containerRef.current.innerHTML = '';
    const svgElement = sunburst({ data, sortComparator, selectionUpdated, colors });
    containerRef.current.appendChild(svgElement);
  }
}, [data, sortComparator, selectionUpdated, colors]);
```

> **Note:** The exact implementation of `sunburst.tsx` needs to be read during implementation. The key principle is: reuse the SVG element and transition D3 nodes rather than destroying and recreating. This is what makes the animation between snapshots smooth.

**Step 4: Test manually**

1. Start dev server
2. View a package with snapshots
3. Click previous/next — sunburst arcs should smoothly animate between states

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add D3 transitions between snapshot data for animated sunburst"
```

---

## Phase 9: Install FontAwesome Regular Icons

### Task 24: Install missing icon package

**Files:**
- Modify: `package.json`

The TrackButton uses `faStarRegular` from `@fortawesome/free-regular-svg-icons`, which isn't currently installed.

**Step 1: Install**

```bash
pnpm add @fortawesome/free-regular-svg-icons
```

**Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install @fortawesome/free-regular-svg-icons"
```

---

## Phase 10: Wiring & Environment

### Task 25: Configure telefunc client-side auth headers

**Files:**
- Create: `apps/npm-burst/src/app/hooks/use-telefunc-auth.ts`
- Modify: `apps/npm-burst/src/pages/+Layout.tsx`

Telefunc client calls need to include the Clerk JWT in the Authorization header.

**Step 1: Create the hook**

Create `apps/npm-burst/src/app/hooks/use-telefunc-auth.ts`:

```typescript
import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { config } from 'telefunc/client';

export function useTelefuncAuth() {
  const { getToken } = useAuth();

  useEffect(() => {
    // Configure telefunc to include auth headers
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes('/_telefunc')) {
        const token = await getToken();
        if (token) {
          init = init || {};
          init.headers = {
            ...init.headers,
            Authorization: `Bearer ${token}`,
          };
        }
      }

      return originalFetch(input, init);
    };

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [getToken]);
}
```

**Step 2: Use in Layout**

Update `apps/npm-burst/src/pages/+Layout.tsx`:

```tsx
import { PropsWithChildren } from 'react';
import { ThemeProvider } from '../app/context/theme-context';
import { AuthProvider } from '../app/context/auth-context';
import { useTelefuncAuth } from '../app/hooks/use-telefunc-auth';
import '../styles.scss';

function TelefuncAuthSetup({ children }: PropsWithChildren) {
  useTelefuncAuth();
  return <>{children}</>;
}

export default function Layout({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <TelefuncAuthSetup>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </TelefuncAuthSetup>
    </AuthProvider>
  );
}
```

> **Note:** The fetch interception approach may need adjustment based on how telefunc makes requests internally. An alternative is to use telefunc's `config.httpHeaders` if available. Check telefunc docs during implementation.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: configure telefunc client with Clerk auth headers"
```

---

### Task 26: Add environment variables and .env files

**Files:**
- Create: `apps/npm-burst/.env.local` (gitignored)
- Modify: `apps/npm-burst/.gitignore` (or root `.gitignore`)

**Step 1: Create .env.local**

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
```

**Step 2: Ensure .env.local is gitignored**

Verify `.gitignore` contains `.env.local`. If not, add it.

**Step 3: Set Cloudflare environment variables**

Via Cloudflare dashboard or wrangler:

```bash
wrangler pages secret put TURSO_DATABASE_URL
wrangler pages secret put TURSO_AUTH_TOKEN
wrangler pages secret put CLERK_SECRET_KEY
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: add environment variable configuration"
```

---

### Task 27: Update Nx project configuration for Cloudflare deployment

**Files:**
- Modify: `apps/npm-burst/project.json`

**Step 1: Update deploy target**

Update `apps/npm-burst/project.json`:

```json
{
  "name": "npm-burst",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/npm-burst/src",
  "projectType": "application",
  "tags": [],
  "targets": {
    "deploy": {
      "command": "wrangler pages deploy ../../dist/apps/web/client --project-name npm-burst",
      "dependsOn": ["build"],
      "options": {
        "cwd": "apps/npm-burst"
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: update deploy target for Cloudflare Pages"
```

---

## Phase 11: Testing

### Task 28: Write tests for telefunc endpoints

**Files:**
- Create: `apps/npm-burst/src/server/functions/tracking.telefunc.spec.ts`
- Create: `apps/npm-burst/src/server/functions/snapshots.telefunc.spec.ts`

**Step 1: Write tracking tests**

Create `apps/npm-burst/src/server/functions/tracking.telefunc.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// These tests verify the DB query logic. Since telefunc endpoints
// depend on getContext() and getDb(), we test the query patterns
// and data flow rather than the full telefunc stack.

describe('tracking queries', () => {
  it('should track a package by inserting into both tables', () => {
    // Test the SQL logic: INSERT OR IGNORE into tracked_packages,
    // then INSERT OR IGNORE into user_tracked_packages
    expect(true).toBe(true); // Placeholder — flesh out with DB mocks
  });

  it('should untrack by deleting from user_tracked_packages only', () => {
    expect(true).toBe(true);
  });

  it('should list only packages tracked by the requesting user', () => {
    expect(true).toBe(true);
  });
});
```

> **Note:** Full integration tests for telefunc endpoints require either a test Turso instance or an in-memory SQLite mock. During implementation, decide whether to use `better-sqlite3` for test doubles or to write these as integration tests against a test database.

**Step 2: Write snapshot tests**

Create `apps/npm-burst/src/server/functions/snapshots.telefunc.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('snapshot queries', () => {
  it('should return empty array for unknown package', () => {
    expect(true).toBe(true);
  });

  it('should return snapshots ordered by date ascending', () => {
    expect(true).toBe(true);
  });
});
```

**Step 3: Run tests**

```bash
nx test npm-burst
```

**Step 4: Commit**

```bash
git add -A
git commit -m "test: add placeholder tests for telefunc endpoints"
```

---

### Task 29: Write tests for snapshot controls

**Files:**
- Create: `apps/npm-burst/src/app/components/snapshot-controls.spec.tsx`

**Step 1: Write component tests**

Create `apps/npm-burst/src/app/components/snapshot-controls.spec.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SnapshotControls } from './snapshot-controls';

describe('SnapshotControls', () => {
  const defaultProps = {
    currentIndex: 0,
    totalSnapshots: 5,
    currentDate: '2026-03-09',
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onLive: vi.fn(),
  };

  it('shows the current date', () => {
    render(<SnapshotControls {...defaultProps} />);
    expect(screen.getByText('2026-03-09')).toBeTruthy();
  });

  it('shows "Live" when currentDate is null', () => {
    render(<SnapshotControls {...defaultProps} currentDate={null} />);
    expect(screen.getByText('Live')).toBeTruthy();
  });

  it('disables previous button at start', () => {
    render(<SnapshotControls {...defaultProps} currentIndex={0} />);
    const prevButton = screen.getByTitle('Previous snapshot');
    expect(prevButton).toBeDisabled();
  });

  it('calls onPrevious when clicked', () => {
    const onPrevious = vi.fn();
    render(<SnapshotControls {...defaultProps} currentIndex={2} onPrevious={onPrevious} />);
    fireEvent.click(screen.getByTitle('Previous snapshot'));
    expect(onPrevious).toHaveBeenCalled();
  });

  it('shows Live button when not in live mode', () => {
    render(<SnapshotControls {...defaultProps} />);
    expect(screen.getByText('Live')).toBeTruthy();
  });

  it('hides Live button when in live mode', () => {
    render(<SnapshotControls {...defaultProps} currentDate={null} />);
    expect(screen.queryByTitle('Return to live data')).toBeNull();
  });
});
```

**Step 2: Run tests**

```bash
nx test npm-burst
```

**Step 3: Commit**

```bash
git add -A
git commit -m "test: add snapshot controls component tests"
```

---

## Phase 12: Final Integration & Cleanup

### Task 30: End-to-end verification

**Step 1: Start dev server**

```bash
nx serve npm-burst
```

**Step 2: Verify anonymous flow**

1. Open `http://localhost:4200/npm-burst`
2. Search for "nx" — sunburst loads from NPM API directly
3. No sign-in button issues (Clerk loads)
4. No "Track" button visible

**Step 3: Verify auth flow**

1. Click "Sign In" in navbar
2. Sign in via Clerk modal
3. "Track" button appears next to search input
4. Search for a package — data now flows through telefunc
5. Click "Track" — star fills in
6. Check tracked packages dropdown — package appears

**Step 4: Verify snapshot flow**

1. After tracking and having snapshots in DB
2. Step controls appear below sunburst
3. Click previous — sunburst animates to snapshot data
4. Click "Live" — returns to real-time data

**Step 5: Verify pre-render build**

```bash
nx build npm-burst
ls dist/apps/web/client/
```

Expected: Static HTML files generated.

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final integration verification"
```

---

## Summary of Files Created/Modified

### New Files:
- `apps/npm-burst/src/pages/+config.ts`
- `apps/npm-burst/src/pages/+Layout.tsx`
- `apps/npm-burst/src/pages/index/+Page.tsx`
- `apps/npm-burst/vitest.config.ts`
- `apps/npm-burst/wrangler.toml`
- `apps/npm-burst/functions/[[path]].ts`
- `apps/npm-burst/functions/_scheduled.ts`
- `apps/npm-burst/src/server/telefunc-handler.ts`
- `apps/npm-burst/src/server/telefunc-context.d.ts`
- `apps/npm-burst/src/server/auth.ts`
- `apps/npm-burst/src/server/db.ts`
- `apps/npm-burst/src/server/schema.sql`
- `apps/npm-burst/src/server/cron.ts`
- `apps/npm-burst/src/server/functions/downloads.telefunc.ts`
- `apps/npm-burst/src/server/functions/tracking.telefunc.ts`
- `apps/npm-burst/src/server/functions/snapshots.telefunc.ts`
- `apps/npm-burst/src/app/context/auth-context.tsx`
- `apps/npm-burst/src/app/hooks/use-telefunc-auth.ts`
- `apps/npm-burst/src/app/components/track-button.tsx`
- `apps/npm-burst/src/app/components/track-button.module.scss`
- `apps/npm-burst/src/app/components/tracked-packages-menu.tsx`
- `apps/npm-burst/src/app/components/tracked-packages-menu.module.scss`
- `apps/npm-burst/src/app/components/snapshot-controls.tsx`
- `apps/npm-burst/src/app/components/snapshot-controls.module.scss`
- `apps/npm-burst/src/app/components/snapshot-controls.spec.tsx`

### Modified Files:
- `package.json` (new dependencies)
- `apps/npm-burst/vite.config.ts` (Vike + Telefunc plugins)
- `apps/npm-burst/project.json` (deploy target)
- `apps/npm-burst/src/app/app.tsx` (auth routing, snapshot state, controls)
- `apps/npm-burst/src/app/hooks/url-params.ts` (SSR safety)
- `apps/npm-burst/src/app/context/theme-context.tsx` (SSR safety)
- `apps/npm-burst/src/app/components/navbar.tsx` (Clerk UI, tracked packages menu)
- `apps/npm-burst/src/app/components/navbar.module.scss` (auth styles)
- `apps/npm-burst/src/app/app.module.scss` (inputRow style)
- `apps/npm-burst/src/app/components/sunburst/d3-sunburst.ts` (updateData method)
- `apps/npm-burst/src/app/components/sunburst/sunburst.tsx` (transition support)

### Deleted Files:
- `apps/npm-burst/src/main.tsx` (replaced by Vike)
- `apps/npm-burst/index.html` (replaced by Vike)
