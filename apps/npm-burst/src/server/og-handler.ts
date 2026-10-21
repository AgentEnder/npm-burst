/**
 * The `/og/...` routes: social card PNGs.
 *
 * Served by the `OgCard` entrypoint in `+server.ts`, the only entrypoint with
 * Workers Cache enabled (see `wrangler.toml`). Caching is driven entirely by
 * the `Cache-Control` header set here. A hit never reaches this code, and a
 * stale hit is answered at once while the cache revalidates behind it.
 *
 * The wasm modules arrive as an argument. `+server.ts` is where the bundler
 * compiles a `.wasm` import into a `WebAssembly.Module`, and taking them as a
 * parameter keeps this module runnable under Node in tests.
 */

import { buildPackagePath } from '../app/utils/package-route';
import { buildBreakdownCard } from '../og/card-model';
import {
  breakdownViewFromSearch,
  parseCardPath,
  SITE_CARD_PATH,
} from '../og/card-url';
import { CHART_RADIUS, type SiteCard } from '../og/card';
import {
  FontSourceUnavailableError,
  initResvg,
  initSatori,
  renderBreakdownCard,
  renderSiteCard,
  type WasmInput,
} from '../og/render';
import { getDb } from './db';
import { getFixtureSnapshots } from './fixtures/packages';
import { getLatestSnapshot } from './snapshots';

export interface OgWasm {
  yoga: WasmInput;
  resvg: WasmInput;
}

/**
 * Snapshots land daily, so an hour-old card is fine, and a day-old one is
 * still worth serving instantly while a fresh one renders.
 */
export const CARD_CACHE_CONTROL =
  'public, max-age=3600, stale-while-revalidate=86400';

const SITE_CARD: SiteCard = {
  title: 'npm downloads, broken down by version',
  subtitle:
    'See how a package splits across its majors, minors and patches, and how that shifts over time.',
  path: '/',
};

function uncacheable(
  status: number,
  body: string,
  extra?: HeadersInit
): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

/**
 * The newest snapshot's downloads, or null for a package we have never
 * snapshotted.
 *
 * Mirrors `package-detail/+data.ts`: fixtures without a database or in dev
 * mode. Only `DB` and `DEV_MODE` are read, so this works without the secrets
 * the rest of the app needs.
 */
async function loadDownloads(
  packageName: string,
  env: Record<string, unknown> | undefined
): Promise<Record<string, number> | null> {
  const db = env?.['DB'] as D1Database | undefined;
  if (!db || env?.['DEV_MODE'] === 'true') {
    return getFixtureSnapshots(packageName).at(-1)?.downloads ?? null;
  }
  return (
    (await getLatestSnapshot(getDb({ DB: db }), packageName))?.downloads ?? null
  );
}

async function renderCard(
  url: URL,
  env: Record<string, unknown> | undefined
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (url.pathname === SITE_CARD_PATH) return renderSiteCard(SITE_CARD);

  const packageName = parseCardPath(url.pathname);
  if (packageName === null) return null;

  const downloads = await loadDownloads(packageName, env);
  const card = downloads
    ? buildBreakdownCard(
        packageName,
        downloads,
        breakdownViewFromSearch(url.search),
        CHART_RADIUS
      )
    : null;

  return card
    ? renderBreakdownCard(card)
    : renderSiteCard({
        title: packageName,
        subtitle: 'npm download stats, broken down by version.',
        path: buildPackagePath(packageName),
      });
}

export async function handleOgRequest(
  request: Request,
  env: Record<string, unknown> | undefined,
  wasm: OgWasm
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return uncacheable(405, 'Method not allowed.', { Allow: 'GET, HEAD' });
  }

  let png: Uint8Array<ArrayBuffer> | null;
  try {
    await Promise.all([initSatori(wasm.yoga), initResvg(wasm.resvg)]);
    png = await renderCard(new URL(request.url), env);
  } catch (err) {
    // A card rendered with fallback fonts would be cached for a day. A 503
    // costs one crawler retry instead.
    if (!(err instanceof FontSourceUnavailableError)) throw err;
    return uncacheable(503, 'Card fonts are temporarily unavailable.', {
      'Retry-After': '60',
    });
  }

  if (!png) return uncacheable(404, 'No such card.');

  return new Response(request.method === 'HEAD' ? null : png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': CARD_CACHE_CONTROL,
    },
  });
}
