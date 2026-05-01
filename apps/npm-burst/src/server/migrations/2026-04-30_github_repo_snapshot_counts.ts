import { Kysely, sql } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE github_health_metrics
    ADD COLUMN open_issues_count INTEGER NOT NULL DEFAULT 0
  `.execute(db);
  await sql`
    ALTER TABLE github_health_metrics
    ADD COLUMN open_pull_requests_count INTEGER NOT NULL DEFAULT 0
  `.execute(db);
  await sql`
    ALTER TABLE github_health_metrics
    ADD COLUMN stars_count INTEGER NOT NULL DEFAULT 0
  `.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE github_health_metrics
    DROP COLUMN stars_count
  `.execute(db);
  await sql`
    ALTER TABLE github_health_metrics
    DROP COLUMN open_pull_requests_count
  `.execute(db);
  await sql`
    ALTER TABLE github_health_metrics
    DROP COLUMN open_issues_count
  `.execute(db);
}
