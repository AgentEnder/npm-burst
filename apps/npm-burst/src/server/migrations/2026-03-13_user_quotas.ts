import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE user_quotas (
      user_id              TEXT PRIMARY KEY NOT NULL,
      max_tracked_packages INTEGER NOT NULL DEFAULT 5
    )
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('user_quotas').execute();
}
