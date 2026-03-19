/**
 * Turso → D1 migration script.
 *
 * Reads from Turso and writes directly to D1 via the Cloudflare REST API
 * using parameterized queries (bypasses D1's 100KB SQL statement limit).
 *
 * Usage:
 *   pnpm exec tsx --env-file=apps/npm-burst/.env.local tools/migrate-turso-to-d1.ts
 *
 * Required env vars:
 *   TURSO_DATABASE_URL    - source Turso database
 *   TURSO_AUTH_TOKEN      - Turso auth token (optional for local)
 *   CLOUDFLARE_ACCOUNT_ID - Cloudflare account ID
 *   CLOUDFLARE_API_TOKEN  - Cloudflare API token with D1 write access
 *   D1_DATABASE_ID        - target D1 database ID
 */

import { createClient } from '@libsql/client';

const tursoUrl = process.env['TURSO_DATABASE_URL'];
const tursoAuthToken = process.env['TURSO_AUTH_TOKEN'];
const cfAccountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
const cfApiToken = process.env['CLOUDFLARE_API_TOKEN'];
const d1DatabaseId =
  process.env['D1_DATABASE_ID'] ?? '273b28f0-f0e3-43e6-b7aa-1fd083c1ae6f';

if (!tursoUrl) {
  console.error('TURSO_DATABASE_URL is required.');
  process.exit(1);
}
if (!cfAccountId || !cfApiToken) {
  console.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.');
  process.exit(1);
}

const turso = createClient({ url: tursoUrl, authToken: tursoAuthToken });

const D1_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/d1/database/${d1DatabaseId}`;

/**
 * Tables ordered to respect foreign key constraints.
 */
const TABLE_ORDER = [
  'tracked_packages',
  'user_tracked_packages',
  'snapshots',
  'npm_api_cache',
  'user_quotas',
  'github_installations',
  'github_repos',
  'github_repo_packages',
  'github_health_snapshots',
  'github_health_metrics',
  'github_bot_patterns',
];

/**
 * Tables whose data is skipped (schema still created).
 */
const SKIP_DATA_TABLES = new Set(['npm_api_cache']);

type D1Param = string | number | null | number[];

function toD1Param(value: unknown): D1Param {
  if (value === null || value === undefined) return null;
  if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    return Array.from(bytes);
  }
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return String(value);
}

async function d1Query(
  sql: string,
  params?: D1Param[]
): Promise<{ success: boolean; errors?: unknown[] }> {
  const body = params ? { sql, params } : { sql };
  const res = await fetch(`${D1_API_BASE}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    success: boolean;
    errors?: unknown[];
  };
  if (!json.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(json.errors)}`);
  }
  return json;
}

async function d1BatchQuery(
  statements: { sql: string; params?: D1Param[] }[]
): Promise<void> {
  for (const stmt of statements) {
    await d1Query(stmt.sql, stmt.params);
  }
}

async function main() {
  console.log('Connecting to Turso...');

  // 1. Read schema from Turso
  const schemaRows = await turso.execute(
    `SELECT type, name, sql FROM sqlite_master
     WHERE type IN ('table', 'index')
       AND name NOT LIKE 'sqlite_%'
       AND name NOT LIKE '_cf_%'
       AND name != 'kysely_migration'
       AND name != 'kysely_migration_lock'
       AND sql IS NOT NULL
     ORDER BY
       CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,
       name`
  );

  const tableStatements = new Map<string, string>();
  const indexStatements: string[] = [];

  for (const row of schemaRows.rows) {
    const type = row['type'] as string;
    const name = row['name'] as string;
    const sql = row['sql'] as string;
    if (type === 'table') {
      tableStatements.set(name, sql);
    } else {
      indexStatements.push(sql);
    }
  }

  // 2. Create schema on D1
  console.log('Creating schema on D1...');

  const schemaStatements: { sql: string }[] = [];

  for (const tableName of TABLE_ORDER) {
    const sql = tableStatements.get(tableName);
    if (sql) schemaStatements.push({ sql });
  }
  // Safety net: tables not in our explicit order
  for (const [name, sql] of tableStatements) {
    if (!TABLE_ORDER.includes(name)) {
      schemaStatements.push({ sql });
    }
  }
  // Indexes
  for (const sql of indexStatements) {
    schemaStatements.push({ sql });
  }
  // Kysely migration tracking
  schemaStatements.push({
    sql: `CREATE TABLE IF NOT EXISTS kysely_migration (
  name TEXT NOT NULL PRIMARY KEY,
  timestamp TEXT NOT NULL
)`,
  });
  schemaStatements.push({
    sql: `CREATE TABLE IF NOT EXISTS kysely_migration_lock (
  id TEXT NOT NULL PRIMARY KEY,
  is_locked INTEGER NOT NULL DEFAULT 0
)`,
  });

  await d1BatchQuery(schemaStatements);
  console.log(`  ✓ ${schemaStatements.length} schema statements applied`);

  // 3. Copy Kysely migration records
  const migrationRows = await turso.execute(
    'SELECT name, timestamp FROM kysely_migration ORDER BY name'
  );
  if (migrationRows.rows.length > 0) {
    const migrationInserts = migrationRows.rows.map((row) => ({
      sql: 'INSERT INTO kysely_migration (name, timestamp) VALUES (?, ?)',
      params: [
        toD1Param(row['name']),
        toD1Param(row['timestamp']),
      ] as D1Param[],
    }));
    await d1BatchQuery(migrationInserts);
    console.log(`  ✓ ${migrationInserts.length} migration records copied`);
  }

  // 4. Copy data table by table
  console.log('Migrating data...');

  for (const tableName of TABLE_ORDER) {
    if (!tableStatements.has(tableName)) continue;
    if (SKIP_DATA_TABLES.has(tableName)) {
      console.log(`  - ${tableName}: skipped (ephemeral cache)`);
      continue;
    }

    const countResult = await turso.execute(
      `SELECT COUNT(*) as cnt FROM "${tableName}"`
    );
    const count = Number(countResult.rows[0]['cnt']);

    if (count === 0) {
      console.log(`  - ${tableName}: 0 rows`);
      continue;
    }

    // Process in pages, batch insert to D1
    const PAGE_SIZE = 100;
    let migrated = 0;

    for (let offset = 0; offset < count; offset += PAGE_SIZE) {
      const rows = await turso.execute(
        `SELECT * FROM "${tableName}" LIMIT ${PAGE_SIZE} OFFSET ${offset}`
      );

      const inserts = rows.rows.map((row) => {
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        const params = columns.map((col) => toD1Param(row[col]));
        return {
          sql: `INSERT INTO "${tableName}" (${columns
            .map((c) => `"${c}"`)
            .join(', ')}) VALUES (${placeholders})`,
          params,
        };
      });

      // D1 batch API has its own limits; send rows individually for
      // tables with large values to avoid batch size limits
      const hasLargeRows = inserts.some(
        (ins) => JSON.stringify(ins.params).length > 50_000
      );

      if (hasLargeRows) {
        for (const insert of inserts) {
          await d1Query(insert.sql, insert.params);
          migrated++;
        }
      } else {
        await d1BatchQuery(inserts);
        migrated += inserts.length;
      }
    }

    console.log(`  ✓ ${tableName}: ${migrated} rows`);
  }

  console.log('Migration complete.');
  turso.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
