import type { Kysely } from 'kysely';
import type { DB } from './db-schema';
import { cachedFetch } from './npm-fetch';

export async function getPackageWeeklyDownloads(
  db: Kysely<DB>,
  pkg: string
): Promise<number> {
  const url = `https://api.npmjs.org/versions/${encodeURI(pkg).replace('/', '%2f')}/last-week`;
  const body = await cachedFetch(db, url);
  const data = JSON.parse(body) as { downloads?: Record<string, number> };
  if (!data.downloads) return 0;
  return Object.values(data.downloads).reduce((sum, n) => sum + n, 0);
}
