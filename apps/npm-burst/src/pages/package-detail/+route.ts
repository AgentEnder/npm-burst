import { parsePackageRoute } from '../../app/utils/package-route';

const PREFIX = '/package/';

/**
 * Matches `/package/<name>[/<tab>]`, including scoped names that span two
 * segments (`/package/@nx/devkit/health`).
 *
 * A Route Function rather than a Route String so the (tested) parser is the
 * only place that knows the URL shape — a `/package/*` glob would match, but
 * then the same splitting rules would have to be re-implemented downstream.
 *
 * Returns false for unroutable URLs so Vike renders its 404 instead of this
 * page guessing at a package name. The bare `/package` search page is a
 * separate page and is intentionally not matched here.
 */
export default (pageContext: { urlPathname: string }) => {
  const { urlPathname } = pageContext;
  if (!urlPathname.startsWith(PREFIX)) return false;

  const parsed = parsePackageRoute(urlPathname.slice(PREFIX.length));
  if (!parsed) return false;

  return {
    routeParams: {
      packageName: parsed.packageName,
      tab: parsed.tab,
    },
  };
};
