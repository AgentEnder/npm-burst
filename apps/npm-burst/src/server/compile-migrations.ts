import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, 'migrations');
const outputDir = path.join(__dirname, '..', '..', 'migrations');

// Migrations that were already applied to D1 via the legacy Kysely-driven
// flow before the switch to `wrangler d1 migrations apply`. Their .ts files
// are still executed against the in-memory Kysely instance so that later
// migrations can ALTER the schema they created, but no .sql file is emitted
// for them — wrangler must not try to replay them against the live DB.
const APPLIED_VIA_KYSELY = new Set([
  '2026-03-11_initial_schema.ts',
  '2026-03-12_api_cache.ts',
  '2026-03-13_user_quotas.ts',
  '2026-03-17_github_health.ts',
  '2026-03-17_tracked_package_metadata.ts',
  '2026-03-18_github_stale_prs.ts',
]);

interface MigrationModule {
  up: (db: Kysely<unknown>) => Promise<void>;
}

async function main() {
  const files = (await fs.readdir(migrationsDir))
    .filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'))
    .sort();

  await fs.mkdir(outputDir, { recursive: true });

  let currentCapture: string[] = [];

  const db = new Kysely<unknown>({
    dialect: new SqliteDialect({
      database: new Database(':memory:'),
    }),
    log: (event) => {
      if (event.level === 'query') {
        currentCapture.push(
          inlineParams(event.query.sql, event.query.parameters)
        );
      }
    },
  });

  const expected = new Set<string>();
  let emittedCount = 0;

  try {
    for (const file of files) {
      currentCapture = [];

      const mod = (await import(
        path.join(migrationsDir, file)
      )) as MigrationModule;
      await mod.up(db);

      if (APPLIED_VIA_KYSELY.has(file)) {
        console.log(`  · skipping ${file} (already applied via Kysely)`);
        continue;
      }

      // Wrangler orders migrations by the numeric prefix produced by
      // `wrangler d1 migrations create`, not by full lexicographic name —
      // so we emit `NNNN_<original-name>.sql` to match that convention while
      // preserving the original name for traceability back to the TS source.
      emittedCount += 1;
      const prefix = String(emittedCount).padStart(4, '0');
      const outName = `${prefix}_${file.replace(/\.(ts|js)$/, '.sql')}`;
      expected.add(outName);

      const outPath = path.join(outputDir, outName);
      const body = currentCapture.map(formatStatement).join('\n\n') + '\n';
      await fs.writeFile(outPath, body);
      console.log(`  → ${outName} (${currentCapture.length} statements)`);
    }
  } finally {
    await db.destroy();
  }

  // Drop any stale .sql files that no longer have a matching .ts migration
  // (handles renames, deletions, or prefix shifts).
  const existing = await fs.readdir(outputDir);
  for (const f of existing) {
    if (f.endsWith('.sql') && !expected.has(f)) {
      await fs.rm(path.join(outputDir, f));
      console.log(`  ✗ removed orphan ${f}`);
    }
  }
}

function formatStatement(sql: string): string {
  const trimmed = sql.trim().replace(/\s+/g, ' ');
  return trimmed.endsWith(';') ? trimmed : trimmed + ';';
}

function inlineParams(sql: string, params: readonly unknown[]): string {
  if (params.length === 0) return sql;
  let i = 0;
  return sql.replace(/\?/g, () => formatParam(params[i++]));
}

function formatParam(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
  if (v instanceof Uint8Array) {
    const hex = Array.from(v)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `X'${hex}'`;
  }
  throw new Error(`Unsupported parameter type for SQL inlining: ${typeof v}`);
}

main().catch((err) => {
  console.error('Compile failed:', err);
  process.exit(1);
});
