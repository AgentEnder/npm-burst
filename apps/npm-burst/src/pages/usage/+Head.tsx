/**
 * The usage dashboard is per-user and only meaningful behind auth, so it has
 * nothing to offer a search engine and should not appear in results. Vike's
 * `Head` is cumulative, so this adds to the root head rather than replacing
 * it. `robots.txt` disallows the path too; this is the belt to that braces,
 * and the one that still applies if the page is linked from elsewhere.
 */
export default function Head() {
  return <meta name="robots" content="noindex, follow" />;
}
