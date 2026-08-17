import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { htmlCacheMiddleware } from './html-cache';

const CACHED_AT_HEADER = 'x-npm-burst-cached-at';

class FakeCache {
  store = new Map<string, Response>();
  putCalls: string[] = [];

  async match(key: Request): Promise<Response | undefined> {
    const hit = this.store.get(key.url);
    return hit ? hit.clone() : undefined;
  }

  async put(key: Request, response: Response): Promise<void> {
    this.putCalls.push(key.url);
    this.store.set(key.url, response);
  }

  /** Seed an entry as though it had been cached `ageSeconds` ago. */
  seed(url: string, body: string, ageSeconds: number) {
    this.store.set(
      url,
      new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          [CACHED_AT_HEADER]: `${Date.now() - ageSeconds * 1000}`,
        },
      })
    );
  }
}

let cache: FakeCache;
let renders: number;

function buildApp(
  responder: () => Response = () =>
    new Response('<html>rendered</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })
) {
  const app = new Hono();
  app.use('/package/*', htmlCacheMiddleware);
  app.all('/package/*', () => {
    renders += 1;
    return responder();
  });
  return app;
}

const executionCtx = {
  waitUntil: (p: Promise<unknown>) => {
    void p;
  },
  passThroughOnException: () => undefined,
  props: {},
} as unknown as ExecutionContext;

beforeEach(() => {
  cache = new FakeCache();
  renders = 0;
  (globalThis as unknown as { caches: unknown }).caches = { default: cache };
});

afterEach(() => {
  delete (globalThis as unknown as { caches?: unknown }).caches;
  vi.restoreAllMocks();
});

describe('htmlCacheMiddleware', () => {
  it('caches a rendered HTML response', async () => {
    const app = buildApp();
    const res = await app.request(
      'https://npm-burst.com/package/nx',
      {},
      {},
      executionCtx
    );

    expect(res.status).toBe(200);
    expect(cache.putCalls).toEqual(['https://npm-burst.com/package/nx']);
  });

  it('drops the query string from the cache key so view state cannot fragment it', async () => {
    const app = buildApp();
    await app.request(
      'https://npm-burst.com/package/nx?sortBy=version&lpf=2.00',
      {},
      {},
      executionCtx
    );

    expect(cache.putCalls).toEqual(['https://npm-burst.com/package/nx']);
  });

  it('keys scoped packages and tabs separately', async () => {
    const app = buildApp();
    await app.request(
      'https://npm-burst.com/package/@nx/devkit',
      {},
      {},
      executionCtx
    );
    await app.request(
      'https://npm-burst.com/package/@nx/devkit/health',
      {},
      {},
      executionCtx
    );

    expect(cache.putCalls).toEqual([
      'https://npm-burst.com/package/@nx/devkit',
      'https://npm-burst.com/package/@nx/devkit/health',
    ]);
  });

  it('serves a fresh entry without re-rendering', async () => {
    cache.seed('https://npm-burst.com/package/nx', '<html>cached</html>', 10);
    const app = buildApp();

    const res = await app.request(
      'https://npm-burst.com/package/nx',
      {},
      {},
      executionCtx
    );

    expect(await res.text()).toContain('cached');
    expect(renders).toBe(0);
  });

  it('serves a stale entry immediately and revalidates behind it', async () => {
    cache.seed('https://npm-burst.com/package/nx', '<html>stale</html>', 3600);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>fresh</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const scheduled: Promise<unknown>[] = [];
    const app = buildApp();
    const res = await app.request('https://npm-burst.com/package/nx', {}, {}, {
      ...executionCtx,
      waitUntil: (p: Promise<unknown>) => {
        scheduled.push(p);
      },
    } as unknown as ExecutionContext);

    // The visitor gets the stale body without waiting on the re-render.
    expect(await res.text()).toContain('stale');
    expect(renders).toBe(0);

    await Promise.all(scheduled);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(cache.store.get('https://npm-burst.com/package/nx')).toBeDefined();
  });

  it('bypasses the cache for requests carrying an Authorization header', async () => {
    cache.seed('https://npm-burst.com/package/nx', '<html>cached</html>', 10);
    const app = buildApp();

    const res = await app.request(
      'https://npm-burst.com/package/nx',
      { headers: { Authorization: 'Bearer token' } },
      {},
      executionCtx
    );

    expect(await res.text()).not.toContain('cached');
    expect(renders).toBe(1);
    expect(cache.putCalls).toEqual([]);
  });

  it('never caches a response carrying Set-Cookie', async () => {
    const app = buildApp(
      () =>
        new Response('<html>personalised</html>', {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'Set-Cookie': 'session=abc',
          },
        })
    );

    await app.request('https://npm-burst.com/package/nx', {}, {}, executionCtx);
    expect(cache.putCalls).toEqual([]);
  });

  it('does not cache non-200 responses', async () => {
    const app = buildApp(
      () =>
        new Response('<html>missing</html>', {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        })
    );

    await app.request('https://npm-burst.com/package/nx', {}, {}, executionCtx);
    expect(cache.putCalls).toEqual([]);
  });

  it('does not cache non-GET requests', async () => {
    const app = buildApp();
    await app.request(
      'https://npm-burst.com/package/nx',
      { method: 'POST' },
      {},
      executionCtx
    );

    expect(cache.putCalls).toEqual([]);
  });
});
