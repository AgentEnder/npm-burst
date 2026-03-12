import type { Kysely } from 'kysely';
import type { DB } from './db-schema';

/**
 * Fetches a URL with DB-level daily caching.
 * Same URL on the same day returns the cached response body.
 */
export async function cachedFetch(
  db: Kysely<DB>,
  url: string
): Promise<string> {
  const today = new Date().toISOString().split('T')[0];

  // Check cache
  const cached = await db
    .selectFrom('npm_api_cache')
    .select('response')
    .where('url', '=', url)
    .where('cache_date', '=', today)
    .executeTakeFirst();

  if (cached) {
    return cached.response;
  }

  // Fetch from NPM
  const response = await fetch(url);
  const body = await response.text();

  // Store in cache
  try {
    await db
      .insertInto('npm_api_cache')
      .values({ url, cache_date: today, response: body })
      .onConflict((oc) => oc.columns(['url', 'cache_date']).doNothing())
      .execute();
  } catch (e) {
    console.error('Failed to cache NPM API response:', e);
  }

  return body;
}
