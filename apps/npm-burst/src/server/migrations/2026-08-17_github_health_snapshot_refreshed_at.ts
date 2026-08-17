import { Kysely, sql } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // `created_at` records when the day's snapshot row was first inserted, but a
  // same-day refresh overwrites that row in place — so it cannot answer "when
  // was this last refreshed". `refreshed_at` tracks every write.
  await sql`
    ALTER TABLE github_health_snapshots
    ADD COLUMN refreshed_at TEXT
  `.execute(db);

  await sql`
    UPDATE github_health_snapshots
    SET refreshed_at = created_at
    WHERE refreshed_at IS NULL
  `.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE github_health_snapshots
    DROP COLUMN refreshed_at
  `.execute(db);
}
