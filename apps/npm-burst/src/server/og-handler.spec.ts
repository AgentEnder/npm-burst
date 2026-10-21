import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SiteCard } from '../og/card';
import type { BreakdownCard } from '../og/card-model';
import { FontSourceUnavailableError } from '../og/render';
import { CARD_CACHE_CONTROL, handleOgRequest } from './og-handler';

const render = vi.hoisted(() => ({
  breakdown: vi.fn(async (_card: BreakdownCard) => new Uint8Array([1])),
  site: vi.fn(async (_card: SiteCard) => new Uint8Array([2])),
}));

vi.mock('../og/render', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../og/render')>()),
  initSatori: vi.fn(async () => undefined),
  initResvg: vi.fn(async () => undefined),
  renderBreakdownCard: render.breakdown,
  renderSiteCard: render.site,
}));

const wasm = { yoga: new Uint8Array(), resvg: new Uint8Array() };

/** No `DB` binding, so the handler reads fixtures, as in local dev. */
function get(path: string, method = 'GET') {
  return handleOgRequest(
    new Request(`https://npm-burst.com${path}`, { method }),
    {},
    wasm
  );
}

beforeEach(() => {
  render.breakdown.mockClear();
  render.site.mockClear();
});

describe('handleOgRequest', () => {
  it('renders a tracked package as a cacheable PNG', async () => {
    const response = await get('/og/package/nx.png');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe(CARD_CACHE_CONTROL);
    expect(render.breakdown).toHaveBeenCalledOnce();
    expect(render.breakdown.mock.calls[0][0].packageName).toBe('nx');
  });

  it('draws the view from the query string', async () => {
    await get('/og/package/nx.png?selectedVersion=v21');
    expect(render.breakdown.mock.calls[0][0].drillRoot?.name).toBe('v21');
  });

  it('falls back to the site card for a package with no snapshot', async () => {
    const response = await get('/og/package/never-tracked.png');

    expect(response.status).toBe(200);
    expect(render.site.mock.calls[0][0]).toMatchObject({
      title: 'never-tracked',
      path: '/package/never-tracked',
    });
  });

  it('serves the site card', async () => {
    const response = await get('/og/site.png');
    expect(response.status).toBe(200);
    expect(render.site).toHaveBeenCalledOnce();
  });

  it('404s an unroutable card without caching it', async () => {
    const response = await get('/og/package/%3Cnope%3E.png');
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects writes', async () => {
    const response = await get('/og/package/nx.png', 'POST');
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
  });

  it('answers HEAD with headers only', async () => {
    const response = await get('/og/package/nx.png', 'HEAD');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(await response.text()).toBe('');
  });

  it('fails retryably, and uncached, when fonts are unreachable', async () => {
    render.breakdown.mockRejectedValueOnce(
      new FontSourceUnavailableError('Google Fonts returned 503')
    );

    const response = await get('/og/package/nx.png');

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('lets other failures propagate', async () => {
    render.breakdown.mockRejectedValueOnce(new Error('boom'));
    await expect(get('/og/package/nx.png')).rejects.toThrow('boom');
  });
});
