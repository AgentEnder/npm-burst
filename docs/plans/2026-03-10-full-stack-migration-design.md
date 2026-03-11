# Full-Stack Migration Design

## Overview

Evolve npm-burst from a client-only SPA into a full-stack app with historical download tracking, authentication, and an edge API. The core visualization and transformation logic stays client-side; the backend handles persistence and scheduled data collection.

## Architecture

### Deployment Topology

- **Cloudflare Pages** — Pre-rendered static React app via Vike. Serves HTML/JS/CSS at the edge.
- **Cloudflare Workers** — Telefunc RPC endpoints only. Handles Turso DB operations and Clerk auth verification.
- **Turso** — SQLite edge database storing tracked packages, user associations, and download snapshots.
- **Clerk** — Authentication provider. Client-side SDK for sign-in/up UI, server-side verification in Workers.

### Data Flow

1. **Live view (anonymous):** Browser → NPM Registry API directly (unchanged).
2. **Live view (signed in):** Browser → Telefunc RPC → Worker → NPM API → return data + opportunistically store snapshot in Turso (1-day lag, yesterday only).
3. **Tracking management (auth required):** Browser → Telefunc RPC → Worker → Clerk verify → Turso.
4. **Historical snapshots (public):** Browser → Telefunc RPC → Worker → Turso.
5. **Cron hydration (daily):** Scheduled Worker → NPM API → Turso. Runs for all tracked packages. 1-day lag — never fetches current day.

### What Stays Client-Side

- NPM API calls for anonymous live data
- Semver parsing and sunburst tree transformation
- D3 visualization and transitions
- Theme management, URL params

### What Moves Server-Side (Telefunc)

- Fetch downloads for signed-in users (enables ad-hoc snapshots)
- Track/untrack a package
- List user's tracked packages
- Fetch snapshots for a package
- Cron: daily snapshot collection for tracked packages

## Database Schema (Turso)

```sql
CREATE TABLE tracked_packages (
  id           INTEGER PRIMARY KEY,
  package_name TEXT UNIQUE NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE user_tracked_packages (
  user_id    TEXT NOT NULL,
  package_id INTEGER NOT NULL REFERENCES tracked_packages(id),
  PRIMARY KEY (user_id, package_id)
);

CREATE TABLE snapshots (
  id            INTEGER PRIMARY KEY,
  package_id    INTEGER NOT NULL REFERENCES tracked_packages(id),
  snapshot_date TEXT NOT NULL,
  downloads     TEXT NOT NULL,
  UNIQUE (package_id, snapshot_date)
);
```

- `tracked_packages` is shared — multiple users tracking "nx" = one row, one cron job.
- `downloads` is a JSON text column: `Record<string, number>` (version → download count).
- One snapshot per package per day max.
- Packages with zero users can be cleaned up or left for historical value.

## Telefunc Endpoints

| Function | Auth | Purpose |
|----------|------|---------|
| `onGetDownloads(pkg)` | Required | Fetch via Worker, save ad-hoc snapshot (yesterday if missing), return data |
| `onTrackPackage(pkg)` | Required | Add package to user's tracked list |
| `onUntrackPackage(pkg)` | Required | Remove from user's tracked list |
| `onGetTrackedPackages()` | Required | List user's tracked packages |
| `onGetSnapshots(pkg)` | None | Fetch all snapshots for a package (public) |

### Ad-hoc Snapshot Logic (`onGetDownloads`)

1. Fetch from NPM API
2. Check if snapshot exists for yesterday
3. If not, insert it (creates `tracked_packages` row if needed)
4. Return download data to client

### Cron Worker (Daily)

1. Query all `tracked_packages` with at least one user in `user_tracked_packages`
2. For each: fetch NPM downloads
3. Upsert into `snapshots` — skip if snapshot exists for that date
4. Always uses 1-day lag (fetches yesterday's data)

## UI Changes

### Navbar

- Clerk sign-in/sign-up button (right side)
- When signed in: user avatar/menu with dropdown to tracked packages list

### Package Search

- Signed-in users: search goes through telefunc (enables ad-hoc snapshots)
- Anonymous users: direct NPM API call (unchanged)
- "Track" / "Untrack" toggle button near search input (visible when signed in)

### Tracked Packages Management

- Dropdown/popover from navbar user menu
- List of tracked package names
- Click to navigate, "x" to untrack

### Historical Step Controls

- Appear below sunburst when snapshots exist for current package
- Previous / Next buttons with snapshot date between them
- "Live" button to return to real-time data
- Visible to everyone (history is public)
- D3 transitions animate sunburst between snapshots
- Sparse timelines are fine — missing dates are skipped (A → C if B is missing)

### UI States

- **No history, anonymous:** Exactly like today.
- **No history, signed in:** Same + "Track" button.
- **Has history:** Step controls appear below sunburst. Defaults to live view. Step back to browse snapshots.

## Migration & Project Structure

### Vike Migration

- Replace Vite SPA entry with Vike page structure
- Single page: `/pages/index/+Page.tsx` (pre-rendered)
- `+config.ts` with `prerender: true`
- `+Layout.tsx` wraps app with Clerk provider
- Telefunc endpoints in `/server/` directory

### Nx Monorepo

- `apps/npm-burst` — Vike app (replaces current SPA)
- `libs/npm/data-access` — Stays, gains telefunc variant for authed calls
- Worker/telefunc server code within app or new lib

### Cloudflare Setup

- `wrangler.toml` for Pages + Workers config
- Cron trigger defined in `wrangler.toml`
- Turso via `@libsql/client`
- Clerk verification via `@clerk/backend`

### New Dependencies

- `vike`, `vike-react` — pre-render framework
- `telefunc` — typesafe RPC
- `@clerk/clerk-react`, `@clerk/backend` — auth
- `@libsql/client` — Turso SDK
- `wrangler` — Cloudflare dev/deploy

### Unchanged

- D3 sunburst component (gains snapshot transition capability)
- Table component
- Theme system
- SCSS modules
- Semver transformation logic
