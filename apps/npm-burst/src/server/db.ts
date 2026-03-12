import { Kysely } from 'kysely';
import { LibsqlDialect } from 'kysely-libsql';
import type { DB } from './db-schema';

let db: Kysely<DB> | null = null;

export function getDb(env: {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
}): Kysely<DB> {
  if (!db) {
    if (!env.TURSO_DATABASE_URL) {
      throw new Error(
        'TURSO_DATABASE_URL is required. Set it in env or use DEV_MODE with a local DB.'
      );
    }
    db = new Kysely<DB>({
      dialect: new LibsqlDialect({
        url: env.TURSO_DATABASE_URL,
        authToken: env.TURSO_AUTH_TOKEN,
      }),
    });
  }
  return db;
}
