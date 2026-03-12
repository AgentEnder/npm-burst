import type { StoreApi } from 'zustand/vanilla';
import type { AppState } from './app-store';

interface UrlParamDef<T> {
  key: string;
  defaultValue: T;
  serialize: (v: T) => string | null;
  deserialize: (s: string) => T;
}

const identity = (s: string) => s;

/**
 * URL params synced via hash on the package page.
 * npmPackageName is encoded in the hash path (e.g., #/nx),
 * the rest are hash query params (e.g., #/nx?sortBy=version&lpf=2.00).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HASH_PARAMS: Record<string, UrlParamDef<any>> = {
  sortByVersion: {
    key: 'sortBy',
    defaultValue: true,
    serialize: (v: boolean) => (v ? 'version' : null),
    deserialize: (s: string) => s === 'version',
  },
  lowPassFilter: {
    key: 'lpf',
    defaultValue: 0.02,
    serialize: (v: number) => `${(v * 100).toFixed(2)}`,
    deserialize: (s: string) => {
      const matches = s.match(/([0-9]+.?[0-9]*)/);
      return matches ? Number.parseFloat(matches[0]) / 100 : 0.001;
    },
  },
  selectedVersion: {
    key: 'selectedVersion',
    defaultValue: null as string | null,
    serialize: (v: string | null) => v,
    deserialize: identity,
  },
  expandedNodes: {
    key: 'expanded',
    defaultValue: [] as string[],
    serialize: (arr: string[]) => (arr.length > 0 ? arr.join(',') : null),
    deserialize: (s: string) => s.split(',').filter(Boolean),
  },
};

/** All fields that participate in URL sync (hash path + hash query params) */
const URL_SYNCED_FIELDS = ['npmPackageName', ...Object.keys(HASH_PARAMS)];

/** Check whether the current page is the package page */
export function isPackagePage(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.includes('/package');
}

/**
 * Parse the hash into a package name and query params.
 * Examples:
 *   #/nx              -> { packageName: 'nx', params: URLSearchParams{} }
 *   #/nx?sortBy=version&lpf=2.00 -> { packageName: 'nx', params: URLSearchParams{sortBy=version, lpf=2.00} }
 *   (empty)           -> { packageName: '', params: URLSearchParams{} }
 */
function parseHash(hash: string): {
  packageName: string;
  params: URLSearchParams;
} {
  // Strip leading '#'
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  // Strip leading '/'
  const normalized = raw.startsWith('/') ? raw.slice(1) : raw;

  const questionIdx = normalized.indexOf('?');
  if (questionIdx === -1) {
    return {
      packageName: decodeURIComponent(normalized),
      params: new URLSearchParams(),
    };
  }

  return {
    packageName: decodeURIComponent(normalized.slice(0, questionIdx)),
    params: new URLSearchParams(normalized.slice(questionIdx + 1)),
  };
}

/** Build a hash string from a package name and params */
function buildHash(packageName: string, params: URLSearchParams): string {
  const paramStr = params.toString();
  const encodedName = encodeURIComponent(packageName);
  return paramStr ? `#/${encodedName}?${paramStr}` : `#/${encodedName}`;
}

/** Read URL hash into partial state for store initialization (package page only) */
export function readInitialStateFromURL(): Partial<AppState> {
  if (typeof document === 'undefined') {
    return getDefaults();
  }

  if (!isPackagePage()) {
    return getDefaults();
  }

  const { packageName, params } = parseHash(document.location.hash);

  const state: Record<string, unknown> = {};

  // Package name from hash path
  state['npmPackageName'] = packageName || 'nx';

  // Other params from hash query string
  for (const [field, def] of Object.entries(HASH_PARAMS)) {
    const encoded = params.get(def.key);
    state[field] =
      encoded !== null ? def.deserialize(encoded) : def.defaultValue;
  }

  return state as Partial<AppState>;
}

/** Return default values for all URL-synced fields */
function getDefaults(): Partial<AppState> {
  const state: Record<string, unknown> = {
    npmPackageName: 'nx',
  };
  for (const [field, def] of Object.entries(HASH_PARAMS)) {
    state[field] = def.defaultValue;
  }
  return state as Partial<AppState>;
}

/** Push current URL-synced state fields to the hash (package page only) */
function pushStateToURL(state: AppState) {
  if (typeof document === 'undefined') return;
  if (!isPackagePage()) return;

  const params = new URLSearchParams();

  for (const [field, def] of Object.entries(HASH_PARAMS)) {
    const value = (state as unknown as Record<string, unknown>)[field];
    const serialized = def.serialize(value);
    if (serialized !== null && serialized !== undefined) {
      params.set(def.key, serialized);
    }
  }

  const newHash = buildHash(state.npmPackageName, params);
  if (newHash !== document.location.hash) {
    window.history.pushState({}, document.title, newHash);
  }
}

/** Subscribe to store changes and push URL-synced fields */
export function subscribeToURLSync(store: StoreApi<AppState>): () => void {
  return store.subscribe((state, prevState) => {
    const changed = URL_SYNCED_FIELDS.some(
      (f) =>
        (state as unknown as Record<string, unknown>)[f] !==
        (prevState as unknown as Record<string, unknown>)[f]
    );
    if (changed) {
      pushStateToURL(state);
    }
  });
}

/** Listen for hashchange (browser back/forward) and update store from URL */
export function listenForURLChanges(store: StoreApi<AppState>): () => void {
  if (!isPackagePage()) {
    // On non-package pages, no URL sync needed
    return () => {
      /* noop */
    };
  }

  const handler = () => {
    const fromURL = readInitialStateFromURL();
    store.setState(fromURL);
  };

  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
}
