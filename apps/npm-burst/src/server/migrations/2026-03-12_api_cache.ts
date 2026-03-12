import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE npm_api_cache (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      url        TEXT NOT NULL,
      cache_date TEXT NOT NULL,
      response   TEXT NOT NULL,
      UNIQUE (url, cache_date)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_npm_api_cache_url_date ON npm_api_cache(url, cache_date)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('npm_api_cache').execute();
}
