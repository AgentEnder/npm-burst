import { Kysely } from 'kysely';
import { LibsqlDialect } from 'kysely-libsql';
import type { Database } from './db-schema';
import type { Env } from './env';

let db: Kysely<Database> | null = null;

export function getDb(
  env: Pick<Env, 'TURSO_DATABASE_URL' | 'TURSO_AUTH_TOKEN'>
): Kysely<Database> {
  if (!db) {
    db = new Kysely<Database>({
      dialect: new LibsqlDialect({
        url: env.TURSO_DATABASE_URL,
        authToken: env.TURSO_AUTH_TOKEN,
      }),
    });
  }
  return db;
}
