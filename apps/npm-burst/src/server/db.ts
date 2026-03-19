import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import type { DB } from './db-schema';

let db: Kysely<DB> | null = null;

export function getDb(env: { DB?: D1Database }): Kysely<DB> {
  if (!db) {
    if (!env.DB) {
      throw new Error(
        'DB binding is required. Ensure [[d1_databases]] is configured in wrangler.toml.'
      );
    }
    db = new Kysely<DB>({
      dialect: new D1Dialect({ database: env.DB }),
    });
  }
  return db;
}
