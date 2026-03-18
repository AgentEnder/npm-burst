import { Kysely, sql } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE github_health_metrics
    ADD COLUMN stale_prs_count INTEGER NOT NULL DEFAULT 0
  `.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE github_health_metrics
    DROP COLUMN stale_prs_count
  `.execute(db);
}
