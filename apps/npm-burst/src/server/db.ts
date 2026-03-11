import { createClient, Client } from '@libsql/client';
import type { Env } from './env';

let client: Client | null = null;

export function getDb(env: Pick<Env, 'TURSO_DATABASE_URL' | 'TURSO_AUTH_TOKEN'>): Client {
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
