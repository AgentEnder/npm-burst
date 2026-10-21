import { buildCardUrl } from '../../og/card-url';

/**
 * The package's breakdown card.
 *
 * Path only, never the query. This HTML is edge-cached per path and shared
 * between visitors, so view state baked in here would leak one visitor's
 * view to the next. The HTML cache adds each request's own card query on the
 * way out (see `withCardQuery`).
 */
export default function image(pageContext: {
  routeParams: Record<string, string>;
}): string {
  return buildCardUrl(pageContext.routeParams['packageName']);
}
