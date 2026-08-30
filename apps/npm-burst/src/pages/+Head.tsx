import { usePageContext } from 'vike-react/usePageContext';

import { SITE_NAME } from '../app/utils/package-seo';
import { absoluteUrl } from '../app/utils/site';

/**
 * Runs synchronously in <head>, before the stylesheet applies, so the first
 * paint is already in the right theme. The HTML itself can't carry the theme:
 * it is prerendered / edge-cached and shared between visitors. Priority:
 * saved choice, then the OS preference. Key must match `THEME_STORAGE_KEY`
 * in `app/context/theme-context.tsx`.
 */
const THEME_BOOTSTRAP = `(function(){try{
var d=document.documentElement;
var s=localStorage.getItem('npm-burst-theme');
d.dataset.theme=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
}catch(e){}})();`;

/**
 * Document head shared by every page.
 *
 * `title` / `description` / `og:*` are emitted by vike-react from the `title`
 * and `description` settings (see `+config.ts` and the per-page overrides).
 * What is left for here is everything vike-react does not generate:
 *
 * - **Canonical.** Package URLs accept view state as query strings
 *   (`?sortBy`, `?lpf`, `?selectedVersion`), and the tab is part of the path.
 *   Without a canonical each of those is a separate URL competing with itself.
 *   Built from `urlPathname`, which excludes the query string.
 * - **Fonts.** Here rather than a CSS `@import`, which is render-blocking and
 *   cannot be preloaded. Preconnect opens the connection in parallel with the
 *   stylesheet.
 * - **Theme bootstrap.** See `THEME_BOOTSTRAP` above.
 */
export default function Head() {
  const pageContext = usePageContext();
  const canonical = absoluteUrl(pageContext.urlPathname);

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      <link rel="canonical" href={canonical} />
      <meta property="og:url" content={canonical} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary" />

      {/*
        SVG first: browsers that support it get the sharp mark at any size and
        ignore the rest. `alternate icon` is the .ico fallback for those that
        do not (notably Safari). The .ico holds real 16/32/48 renders rather
        than one bitmap downscaled, so the 16px entry keeps clean geometry.
      */}
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link
        rel="alternate icon"
        href="/favicon.ico"
        sizes="16x16 32x32 48x48"
      />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
      />
    </>
  );
}
