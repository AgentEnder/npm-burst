/**
 * Canonical origin for absolute URLs (canonical links, Open Graph, sitemap).
 *
 * A constant rather than something derived from the request, because the
 * landing page and 404 are prerendered — at build time there is no request to
 * derive an origin from. It matches the `custom_domain` route in
 * `wrangler.toml`; if that ever changes, change it here too.
 */
export const SITE_ORIGIN = 'https://npm-burst.com';

/**
 * `/package/nx` -> `https://npm-burst.com/package/nx/`
 *
 * The trailing slash is not cosmetic. `trailingSlash: true` in `+config.ts`
 * means `/usage` redirects to `/usage/`, so emitting a canonical (or a sitemap
 * entry) without it would point search engines at a URL that redirects — worse
 * than publishing none at all. `pageContext.urlPathname` has no trailing
 * slash, so normalising here is what keeps the two consistent.
 *
 * Paths carrying a file extension are left alone: `/sitemap.xml/` is not a
 * thing.
 */
export function absoluteUrl(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const hasExtension = /\.[a-z0-9]+$/i.test(path);
  const normalized = hasExtension || path.endsWith('/') ? path : `${path}/`;
  return `${SITE_ORIGIN}${normalized}`;
}
