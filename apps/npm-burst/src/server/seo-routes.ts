/**
 * `robots.txt` and `sitemap.xml`.
 *
 * Served from the Worker rather than `public/` because the sitemap is a
 * function of the database: the indexable surface is one URL per tracked
 * package, and that set changes whenever somebody tracks something new.
 */

import { buildPackagePath } from '../app/utils/package-route';
import { absoluteUrl, SITE_ORIGIN } from '../app/utils/site';
import { getDb } from './db';
import { listTrackedPackages } from './snapshots';

/** Sitemaps cap at 50k URLs; we are nowhere near, but the bound is cheap. */
const MAX_SITEMAP_URLS = 45_000;

const CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';

export function renderRobotsTxt(): string {
  return [
    'User-agent: *',
    'Allow: /',
    // Per-user dashboard: nothing to index, and it is meaningless signed out.
    'Disallow: /usage',
    // The RPC endpoint and GitHub App callbacks are not documents.
    'Disallow: /_telefunc',
    'Disallow: /api/',
    '',
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    '',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface SitemapEntry {
  path: string;
  lastmod?: string | null;
}

export function renderSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map(({ path, lastmod }) => {
      const lastmodTag = lastmod
        ? `<lastmod>${escapeXml(lastmod)}</lastmod>`
        : '';
      return `<url><loc>${escapeXml(
        absoluteUrl(path)
      )}</loc>${lastmodTag}</url>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

export function robotsResponse(): Response {
  return new Response(renderRobotsTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': CACHE_CONTROL,
    },
  });
}

export async function sitemapResponse(
  env: Record<string, unknown> | undefined
): Promise<Response> {
  const entries: SitemapEntry[] = [{ path: '/' }];

  // Without a database binding (local dev, preview) the sitemap degrades to
  // the static routes rather than failing the request.
  if (env) {
    try {
      const tracked = await listTrackedPackages(
        getDb(env as Parameters<typeof getDb>[0]),
        MAX_SITEMAP_URLS
      );
      for (const { packageName, lastSnapshotDate } of tracked) {
        entries.push({
          path: buildPackagePath(packageName),
          lastmod: lastSnapshotDate,
        });
      }
    } catch {
      /* fall through to the static entries */
    }
  }

  return new Response(renderSitemapXml(entries), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': CACHE_CONTROL,
    },
  });
}

export { SITE_ORIGIN };
