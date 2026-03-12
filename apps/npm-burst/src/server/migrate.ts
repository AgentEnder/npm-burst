import { FileMigrationProvider, Kysely, Migrator } from 'kysely';
import { LibsqlDialect } from 'kysely-libsql';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MigrateOptions {
  url: string;
  authToken?: string;
}

export async function runMigrations(options: MigrateOptions) {
  const db = new Kysely<any>({
    dialect: new LibsqlDialect({
      url: options.url,
      authToken: options.authToken,
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
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('TURSO_DATABASE_URL is required');
  process.exit(1);
}

console.log('Running migrations...');
runMigrations({ url, authToken })
  .then(() => {
    console.log('Migrations complete.');
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
