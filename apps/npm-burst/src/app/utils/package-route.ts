/**
 * Routing for `/package/...` URLs.
 *
 * The package name may itself contain a slash (`@scope/name`), so the tab
 * cannot be found by splitting on the last segment. npm scoped names are
 * exactly two segments, which makes the split deterministic:
 *
 *   nx                    -> name `nx`,          default tab
 *   nx/health             -> name `nx`,          tab `health`
 *   @nx/devkit            -> name `@nx/devkit`,  default tab
 *   @nx/devkit/health     -> name `@nx/devkit`,  tab `health`
 *
 * The tab is read positionally, never by name — a package genuinely called
 * `health` sits in the package position and is treated as such.
 */

/**
 * Tab slugs are the `viewMode` values verbatim, so no slug<->state mapping
 * table is needed. `sunburst` is the default and therefore never appears in a
 * URL, which is why its internal name not matching its "Breakdown" label is
 * invisible to users.
 */
export const PACKAGE_TABS = [
  'sunburst',
  'adoption',
  'migration',
  'lifecycle',
  'health',
] as const;

export type PackageTab = (typeof PACKAGE_TABS)[number];

export const DEFAULT_PACKAGE_TAB: PackageTab = 'sunburst';

export interface PackageRoute {
  packageName: string;
  tab: PackageTab;
}

function isPackageTab(value: string): value is PackageTab {
  return (PACKAGE_TABS as readonly string[]).includes(value);
}

/**
 * Parse the portion of the URL after `/package/`.
 *
 * Returns null for anything unroutable (unknown tab, bare scope, trailing
 * junk) so the caller can render a 404 rather than silently guessing — two
 * URLs rendering the same view would fragment both analytics and the cache.
 */
export function parsePackageRoute(rest: string): PackageRoute | null {
  // Vike's `trailingSlash: true` means the glob captures a trailing slash,
  // and a leading slash survives some call sites.
  const trimmed = rest.replace(/^\/+/, '').replace(/\/+$/, '');
  if (trimmed === '') return null;

  const segments = trimmed.split('/').map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });

  const isScoped = segments[0].startsWith('@');
  const nameSegmentCount = isScoped ? 2 : 1;

  if (segments.length < nameSegmentCount) return null;
  if (segments.some((segment) => segment === '')) return null;

  const packageName = segments.slice(0, nameSegmentCount).join('/');
  const tabSegments = segments.slice(nameSegmentCount);

  if (tabSegments.length === 0) {
    return { packageName, tab: DEFAULT_PACKAGE_TAB };
  }
  if (tabSegments.length > 1) return null;

  const tab = tabSegments[0];
  if (!isPackageTab(tab)) return null;

  return { packageName, tab };
}

export interface LegacyPackageHash {
  packageName: string;
  /** Hash query params (`sortBy`, `lpf`, …), carried over verbatim. */
  search: string;
}

/**
 * Parse the retired `#/<package>[?params]` hash format.
 *
 * Links to `/package#/nx` are out in the wild — in READMEs, chat history and
 * bookmarks — and the server never sees a fragment, so they can only be
 * rescued on the client. Returns null when there's no package to redirect to.
 */
export function parseLegacyPackageHash(hash: string): LegacyPackageHash | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const normalized = raw.startsWith('/') ? raw.slice(1) : raw;
  if (normalized === '') return null;

  const questionIdx = normalized.indexOf('?');
  const rawName =
    questionIdx === -1 ? normalized : normalized.slice(0, questionIdx);
  const search = questionIdx === -1 ? '' : normalized.slice(questionIdx + 1);

  let packageName: string;
  try {
    packageName = decodeURIComponent(rawName);
  } catch {
    packageName = rawName;
  }

  packageName = packageName.trim();
  if (packageName === '') return null;

  return { packageName, search };
}

/** Canonical path a legacy hash URL should be replaced with, or null. */
export function buildLegacyRedirectPath(hash: string): string | null {
  const legacy = parseLegacyPackageHash(hash);
  if (!legacy) return null;

  const path = buildPackagePath(legacy.packageName);
  return legacy.search ? `${path}?${legacy.search}` : path;
}

/**
 * Build the canonical path for a package view. The default tab is omitted so
 * each view has exactly one URL.
 */
export function buildPackagePath(
  packageName: string,
  tab: PackageTab = DEFAULT_PACKAGE_TAB
): string {
  // The scope separator stays literal — `@nx/devkit` is two path segments, not
  // an encoded one. Encoding it to %2F would break the parse and some proxies
  // normalize it back anyway.
  // `@` is a legal path character (RFC 3986 sub-delim) and npm/npmjs.com use
  // it literally, so restore it after encoding the rest of the segment.
  const encodedName = packageName
    .split('/')
    .map((segment) => encodeURIComponent(segment).replace(/%40/g, '@'))
    .join('/');

  const suffix = tab === DEFAULT_PACKAGE_TAB ? '' : `/${tab}`;
  return `/package/${encodedName}${suffix}`;
}
