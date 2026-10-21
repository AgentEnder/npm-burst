/**
 * Where a package's social card lives, and how to get back from that URL to
 * the package and view.
 *
 * Both directions live here. `+image.ts` and the HTML rewriter build card
 * URLs and the OG handler takes them apart, and a mismatch between them only
 * shows up as a broken preview on someone else's timeline.
 *
 * Pure: no fonts, no wasm, no Worker globals.
 */

import { canonicalSearch, readStateFromSearch } from '../app/store/url-params';
import { encodePackageName } from '../app/utils/package-route';
import { SITE_ORIGIN } from '../app/utils/site';
import type { BreakdownView } from './card-model';

/** The size Open Graph and X both render without cropping. */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

export const CARD_PATH_PREFIX = '/og/package/';
export const SITE_CARD_PATH = '/og/site.png';
const CARD_EXTENSION = '.png';

/** Query params that change what the breakdown card draws. */
export const CARD_QUERY_KEYS = [
  'filter',
  'sortBy',
  'lpf',
  'selectedVersion',
  'expanded',
] as const;

/**
 * npm's naming rules, loosened to allow the uppercase that legacy packages
 * (`JSONStream`) still carry. Restricting names this way also keeps every
 * card inside the ASCII font subset, and stops the card route from printing
 * arbitrary text under the brand.
 */
const PACKAGE_NAME =
  /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;
const MAX_PACKAGE_NAME = 214;

/**
 * The card's share of a page query string, canonicalized.
 *
 * Every card URL a crawler sees comes through here, so equivalent views share
 * one URL and one cache entry.
 */
export function cardQuery(search: string): string {
  return canonicalSearch(search, CARD_QUERY_KEYS);
}

export function buildCardPath(packageName: string): string {
  return `${CARD_PATH_PREFIX}${encodePackageName(
    packageName
  )}${CARD_EXTENSION}`;
}

export function buildCardUrl(packageName: string, search = ''): string {
  return `${SITE_ORIGIN}${buildCardPath(packageName)}${cardQuery(search)}`;
}

export const SITE_CARD_URL = `${SITE_ORIGIN}${SITE_CARD_PATH}`;

/** `/og/package/@nx/devkit.png` -> `@nx/devkit`, or null for anything else. */
export function parseCardPath(pathname: string): string | null {
  if (
    !pathname.startsWith(CARD_PATH_PREFIX) ||
    !pathname.endsWith(CARD_EXTENSION)
  ) {
    return null;
  }

  const encoded = pathname.slice(
    CARD_PATH_PREFIX.length,
    -CARD_EXTENSION.length
  );
  let packageName: string;
  try {
    packageName = encoded.split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }

  if (packageName.length > MAX_PACKAGE_NAME) return null;
  return PACKAGE_NAME.test(packageName) ? packageName : null;
}

/** The breakdown view a page query string selects, defaults filled in. */
export function breakdownViewFromSearch(search: string): BreakdownView {
  const state = readStateFromSearch(search);
  return {
    lowPassFilter: state.lowPassFilter ?? 0.02,
    expandedNodes: state.expandedNodes ?? [],
    versionFilter: state.versionFilter ?? '',
    sortByVersion: state.sortByVersion ?? true,
    selectedVersion: state.selectedVersion ?? null,
  };
}
