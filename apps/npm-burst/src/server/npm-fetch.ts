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

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.error(`NPM API network request failed for ${url}:`, error);
    throw error;
  }
  const body = await response.text();

  if (!response.ok) {
    console.error(`NPM API request failed for ${url}: ${response.status}`, {
      body: body.slice(0, 400),
    });
    throw new Error(`NPM API request failed (${response.status})`);
  }

  // D1 caps row size around 1 MiB (SQLITE_TOOBIG); popular packages'
  // full registry docs blow past that. Skip the cache write rather
  // than fire-and-log every time — the caller still gets `body`.
  // Long-term fix: gzip-compress into a BLOB column (see
  // `@npm-burst/shared` `compressJson`, used by the snapshots table).
  const MAX_CACHE_BYTES = 900_000;
  if (new Blob([body]).size > MAX_CACHE_BYTES) {
    return body;
  }

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
