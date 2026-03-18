import { Kysely, sql } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE tracked_packages
    ADD COLUMN maintainers_json TEXT
  `.execute(db);

  await sql`
    ALTER TABLE tracked_packages
    ADD COLUMN github_owner TEXT
  `.execute(db);

  await sql`
    ALTER TABLE tracked_packages
    ADD COLUMN github_repo_name TEXT
  `.execute(db);

  await sql`
    ALTER TABLE tracked_packages
    ADD COLUMN metadata_refreshed_at TEXT
  `.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE tracked_packages
    DROP COLUMN metadata_refreshed_at
  `.execute(db);

  await sql`
    ALTER TABLE tracked_packages
    DROP COLUMN github_repo_name
  `.execute(db);

  await sql`
    ALTER TABLE tracked_packages
    DROP COLUMN github_owner
  `.execute(db);

  await sql`
    ALTER TABLE tracked_packages
    DROP COLUMN maintainers_json
  `.execute(db);
}
