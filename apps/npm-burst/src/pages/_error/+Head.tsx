/**
 * Error and not-found pages must never be indexed — an indexed 404 is a
 * ranking liability, and this page is reachable at any unmatched URL.
 */
export default function Head() {
  return <meta name="robots" content="noindex, nofollow" />;
}
