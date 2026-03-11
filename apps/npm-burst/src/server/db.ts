import { Kysely } from 'kysely';
import { LibsqlDialect } from 'kysely-libsql';
import type { DB } from './db-schema';
import type { Env } from './env';

let db: Kysely<DB> | null = null;

export function getDb(
  env: Pick<Env, 'TURSO_DATABASE_URL' | 'TURSO_AUTH_TOKEN'>
): Kysely<DB> {
  if (!db) {
    db = new Kysely<DB>({
      dialect: new LibsqlDialect({
        url: env.TURSO_DATABASE_URL,
        authToken: env.TURSO_AUTH_TOKEN,
      }),
    });
  }
  return db;
}
