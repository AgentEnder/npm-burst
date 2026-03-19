# Turso to D1 Migration

## Problem

The usage endpoint (`onGetUsageInfo`) hits Cloudflare's 50-subrequest limit because Turso queries go over HTTP, and each `Kysely.execute()` counts as a subrequest. With 10 tracked packages, worst-case subrequest count is ~85.

## Solution

Migrate from Turso (libsql over HTTP) to Cloudflare D1 (native binding). D1 queries use internal RPC and do not count against the subrequest limit.

## Migration Script

**File:** `tools/migrate-turso-to-d1.ts`

- Connects to Turso via existing env vars
- Reads schema from `sqlite_master`
- Dumps all table data as INSERT statements
- Outputs a single `.sql` file for `wrangler d1 execute`
- Handles BLOB columns via hex encoding
- Orders tables to respect foreign key constraints

**Usage:**
```bash
pnpm exec tsx tools/migrate-turso-to-d1.ts > d1-migration.sql
wrangler d1 execute <DB_NAME> --file=d1-migration.sql
```

## Code Changes

### db.ts (both apps)

Replace `LibsqlDialect` with `D1Dialect` from `kysely-d1`. The `getDb` function accepts `env.DB` (a `D1Database` binding) instead of URL/token strings.

### env.ts (both apps)

Remove `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Add `DB` as a `D1Database` binding (not Zod-validated since it's an object).

### wrangler.toml (both apps)

Add D1 binding:
```toml
[[d1_databases]]
binding = "DB"
database_name = "npm-burst-db"
database_id = "<fill in after creation>"
```

### migrate.ts

Update to use D1-compatible dialect. Keep Kysely `FileMigrationProvider` pattern.

### tools/db-query.ts

Update to use D1 instead of libsql.

### Dependencies

- Add: `kysely-d1`
- Remove: `kysely-libsql`, `@libsql/client`, `@libsql/kysely-libsql`
- Keep: `better-sqlite3` for local dev and migration runner
