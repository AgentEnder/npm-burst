import { FileMigrationProvider, Kysely, Migrator, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MigrateOptions {
  /** Path to a local SQLite file (e.g. "file:local.db" or "local.db") */
  dbPath: string;
}

export async function runMigrations(options: MigrateOptions) {
  const filePath = options.dbPath.replace(/^file:/, '');

  const db = new Kysely({
    dialect: new SqliteDialect({
      database: new Database(filePath),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((result) => {
    if (result.status === 'Success') {
      console.log(`  ✓ ${result.migrationName}`);
    } else if (result.status === 'Error') {
      console.error(`  ✗ ${result.migrationName}`);
    }
  });

  if (error) {
    console.error('Migration failed:', error);
    await db.destroy();
    throw error;
  }

  await db.destroy();
}

// CLI entry point
const dbPath = process.env.D1_LOCAL_DB ?? 'file:local.db';

console.log(`Running migrations against ${dbPath}...`);
runMigrations({ dbPath })
  .then(() => {
    console.log('Migrations complete.');
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
