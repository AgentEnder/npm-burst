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
 * View state synced to the query string.
 *
 * The package name and tab are NOT here — they live in the path
 * (`/package/@nx/devkit/health`) and are supplied by the route, so this module
 * only owns the incidental view state. That split matters for the edge cache:
 * these params never change what the server renders, so the HTML cache key
 * deliberately ignores them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const QUERY_PARAMS: Record<string, UrlParamDef<any>> = {
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

const URL_SYNCED_FIELDS = Object.keys(QUERY_PARAMS);

/** Check whether the current page is a package page */
export function isPackagePage(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.includes('/package');
}

/** Read query params into partial state for store initialization */
export function readInitialStateFromURL(): Partial<AppState> {
  if (typeof document === 'undefined') {
    return getDefaults();
  }

  const params = new URLSearchParams(document.location.search);
  const state: Record<string, unknown> = {};

  for (const [field, def] of Object.entries(QUERY_PARAMS)) {
    const encoded = params.get(def.key);
    state[field] =
      encoded !== null ? def.deserialize(encoded) : def.defaultValue;
  }

  return state as Partial<AppState>;
}

/** Return default values for all URL-synced fields */
function getDefaults(): Partial<AppState> {
  const state: Record<string, unknown> = {};
  for (const [field, def] of Object.entries(QUERY_PARAMS)) {
    state[field] = def.defaultValue;
  }
  return state as Partial<AppState>;
}

/**
 * Push current URL-synced state to the query string, leaving the path (and
 * therefore the package and tab) untouched.
 */
function pushStateToURL(state: AppState) {
  if (typeof document === 'undefined') return;
  if (!isPackagePage()) return;

  const params = new URLSearchParams();

  for (const [field, def] of Object.entries(QUERY_PARAMS)) {
    const value = (state as unknown as Record<string, unknown>)[field];
    const serialized = def.serialize(value);
    if (serialized !== null && serialized !== undefined) {
      params.set(def.key, serialized);
    }
  }

  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
  if (next !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState({}, document.title, next);
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

/** Listen for back/forward navigation and update store from the query string */
export function listenForURLChanges(store: StoreApi<AppState>): () => void {
  if (typeof window === 'undefined') {
    return () => {
      /* noop */
    };
  }

  const handler = () => {
    if (!isPackagePage()) return;
    store.setState(readInitialStateFromURL());
  };

  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
}
