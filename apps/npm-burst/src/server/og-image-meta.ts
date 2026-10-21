/**
 * Per-request `og:image` for edge-cached HTML.
 *
 * Package HTML is cached per path, so it can only carry the path-only card
 * URL. The card should show the view the shared link points at, which lives
 * in the query string. This adds the request's card query to the tag on the
 * way out, on cache hits and misses alike, without touching what is stored.
 */

import { SITE_ORIGIN } from '../app/utils/site';
import { CARD_PATH_PREFIX, cardQuery } from '../og/card-url';

const CARD_URL_PREFIX = `${SITE_ORIGIN}${CARD_PATH_PREFIX}`;

/**
 * The tag content with `search`'s card query appended, or null to leave it
 * alone. Only package card URLs without a query of their own are touched.
 */
export function cardImageContent(
  content: string | null,
  search: string
): string | null {
  if (!content?.startsWith(CARD_URL_PREFIX) || content.includes('?')) {
    return null;
  }
  const query = cardQuery(search);
  return query ? `${content}${query}` : null;
}

/** No-op outside workerd, where `HTMLRewriter` does not exist. */
export function withCardQuery(
  response: Response,
  requestUrl: string
): Response {
  const contentType = response.headers.get('Content-Type') ?? '';
  if (
    typeof HTMLRewriter === 'undefined' ||
    !contentType.includes('text/html')
  ) {
    return response;
  }

  const { search } = new URL(requestUrl);
  if (!cardQuery(search)) return response;

  return new HTMLRewriter()
    .on('meta[property="og:image"]', {
      element(element) {
        const content = cardImageContent(
          element.getAttribute('content'),
          search
        );
        if (content) element.setAttribute('content', content);
      },
    })
    .transform(response);
}
