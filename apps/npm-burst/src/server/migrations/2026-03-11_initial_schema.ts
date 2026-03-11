import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE tracked_packages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      package_name TEXT UNIQUE NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `.execute(db);

  await sql`
    CREATE TABLE user_tracked_packages (
      user_id    TEXT NOT NULL,
      package_id INTEGER NOT NULL REFERENCES tracked_packages(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, package_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE snapshots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id    INTEGER NOT NULL REFERENCES tracked_packages(id) ON DELETE CASCADE,
      snapshot_date TEXT NOT NULL,
      downloads     TEXT NOT NULL,
      UNIQUE (package_id, snapshot_date)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_snapshots_package_date ON snapshots(package_id, snapshot_date)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('snapshots').execute();
  await db.schema.dropTable('user_tracked_packages').execute();
  await db.schema.dropTable('tracked_packages').execute();
}
