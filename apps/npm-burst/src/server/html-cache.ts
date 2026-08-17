/**
 * Stale-while-revalidate cache for server-rendered package HTML.
 *
 * Safe to cache in a *shared* cache only because SSR output here is
 * user-agnostic: `getAuthUserId` (see `auth.ts`) authenticates from the
 * `Authorization: Bearer` header alone, never cookies, and browsers do not
 * send that header on navigations. So every HTML render is anonymous.
 *
 * ⚠️ If auth ever moves to cookies, this becomes a data-leak vector — a
 * signed-in user's HTML would be served to everyone. The `Authorization` and
 * `Cookie` guards below are the tripwires for that.
 *
 * Note: `caches.default` is a no-op outside Cloudflare's edge (including
 * workers.dev subdomains), so this silently does nothing in local dev and
 * preview. It takes effect on the custom domain.
 */

import type { MiddlewareHandler } from 'hono';

/** How long a cached render is served without revalidating. */
const FRESH_SECONDS = 5 * 60;
/** How long a stale render may still be served while revalidating behind it. */
const STALE_SECONDS = 24 * 60 * 60;

const CACHED_AT_HEADER = 'x-npm-burst-cached-at';
/** Marks a self-subrequest so revalidation can't recurse into itself. */
const REVALIDATE_HEADER = 'x-npm-burst-revalidate';

interface CacheStorageWithDefault {
  default?: Cache;
}

function getEdgeCache(): Cache | null {
  const caches = (globalThis as { caches?: CacheStorageWithDefault }).caches;
  return caches?.default ?? null;
}

/**
 * Cache key = the path, with the query string dropped.
 *
 * `?sortBy`, `?lpf`, `?selectedVersion` and `?expanded` are client-side view
 * state that never reaches the server render, so keying on them would mint a
 * fresh entry for every filter tweak and make the cache almost useless.
 */
function buildCacheKey(request: Request): Request {
  const url = new URL(request.url);
  url.search = '';
  return new Request(url.toString(), { method: 'GET' });
}

function ageSeconds(response: Response): number {
  const cachedAt = response.headers.get(CACHED_AT_HEADER);
  if (!cachedAt) return Number.POSITIVE_INFINITY;
  const parsed = Number.parseInt(cachedAt, 10);
  if (Number.isNaN(parsed)) return Number.POSITIVE_INFINITY;
  return (Date.now() - parsed) / 1000;
}

/** Stamp freshness metadata so `cache.match` results can be aged on read. */
function withCacheMetadata(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, `${Date.now()}`);
  headers.set(
    'Cache-Control',
    `public, max-age=${FRESH_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isCacheable(response: Response): boolean {
  if (response.status !== 200) return false;
  // A Set-Cookie means the response is personalised; `cache.put` rejects these
  // anyway, but bail explicitly so the intent is legible.
  if (response.headers.has('Set-Cookie')) return false;
  const contentType = response.headers.get('Content-Type') ?? '';
  return contentType.includes('text/html');
}

/**
 * Re-render in the background by re-entering the Worker for the same URL. The
 * marker header makes the inner request skip the cache lookup (and therefore
 * skip scheduling another revalidation), so this cannot recurse.
 */
async function revalidate(key: Request, cache: Cache): Promise<void> {
  const response = await fetch(
    new Request(key.url, {
      method: 'GET',
      headers: { [REVALIDATE_HEADER]: '1' },
    })
  );

  if (isCacheable(response)) {
    await cache.put(key, withCacheMetadata(response));
  }
}

export const htmlCacheMiddleware: MiddlewareHandler = async (c, next) => {
  const cache = getEdgeCache();
  const request = c.req.raw;

  const isRevalidation = c.req.header(REVALIDATE_HEADER) === '1';
  const skipCache =
    !cache ||
    c.req.method !== 'GET' ||
    // Never serve a shared copy of anything that could have been personalised.
    !!c.req.header('authorization');

  if (skipCache) {
    await next();
    return;
  }

  const key = buildCacheKey(request);

  if (!isRevalidation) {
    const hit = await cache.match(key);
    if (hit) {
      if (ageSeconds(hit) <= FRESH_SECONDS) {
        return hit;
      }
      // Stale: answer immediately, refresh behind the response.
      c.executionCtx?.waitUntil(revalidate(key, cache));
      return hit;
    }
  }

  await next();

  const response = c.res;
  if (response && isCacheable(response)) {
    const stored = withCacheMetadata(response.clone());
    c.executionCtx?.waitUntil(cache.put(key, stored));
  }
};
