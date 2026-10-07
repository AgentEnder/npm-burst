import type { StoreApi } from 'zustand/vanilla';
import type { AppState } from './app-store';

/**
 * One query parameter.
 *
 * `read` pulls the value out of the store and `apply` turns a value back into
 * store state. A value equal to `defaultValue` is left out of the URL, and an
 * absent or unparseable parameter reads as the default.
 */
interface UrlParam<T> {
  key: string;
  defaultValue: T;
  read: (state: AppState) => T;
  apply: (value: T) => Partial<AppState>;
  serialize: (value: T) => string;
  /** Returns `undefined` for a value the URL cannot represent. */
  deserialize: (encoded: string) => T | undefined;
}

type FieldOf<T> = {
  [K in keyof AppState]: AppState[K] extends T ? K : never;
}[keyof AppState];

function field<T>(name: FieldOf<T>) {
  return {
    read: (state: AppState) => state[name] as T,
    apply: (value: T) => ({ [name]: value } as Partial<AppState>),
  };
}

function enumParam<T extends string>(
  key: string,
  name: FieldOf<T>,
  values: readonly T[],
  defaultValue: T
): UrlParam<T> {
  return {
    key,
    defaultValue,
    ...field<T>(name),
    serialize: (value) => value,
    deserialize: (encoded) =>
      (values as readonly string[]).includes(encoded)
        ? (encoded as T)
        : undefined,
  };
}

function flagParam(
  key: string,
  name: FieldOf<boolean>,
  defaultValue: boolean
): UrlParam<boolean> {
  return {
    key,
    defaultValue,
    ...field<boolean>(name),
    serialize: (value) => (value ? '1' : '0'),
    deserialize: (encoded) =>
      encoded === '1' ? true : encoded === '0' ? false : undefined,
  };
}

function numberParam(
  key: string,
  name: FieldOf<number>,
  defaultValue: number,
  isValid: (value: number) => boolean
): UrlParam<number> {
  return {
    key,
    defaultValue,
    ...field<number>(name),
    serialize: (value) => String(value),
    deserialize: (encoded) => {
      const value = Number(encoded);
      return encoded !== '' && isValid(value) ? value : undefined;
    },
  };
}

function listParam(key: string, name: FieldOf<string[]>): UrlParam<string[]> {
  return {
    key,
    defaultValue: [],
    ...field<string[]>(name),
    serialize: (values) => values.join(','),
    deserialize: (encoded) => encoded.split(',').filter(Boolean),
  };
}

function textParam(
  key: string,
  name: FieldOf<string | null>
): UrlParam<string | null> {
  return {
    key,
    defaultValue: null,
    ...field<string | null>(name),
    serialize: (value) => value ?? '',
    deserialize: (encoded) => encoded || undefined,
  };
}

const VERSION_LEVELS = ['major', 'minor', 'patch'] as const;
const TIME_WINDOWS = ['30d', '90d', '6mo', '1y', 'all'] as const;
const MIGRATION_WINDOWS = ['90d', '180d', '1y', 'all'] as const;

/**
 * View state synced to the query string.
 *
 * The package name and tab are NOT here — they live in the path
 * (`/package/@nx/devkit/health`) and are supplied by the route, so this module
 * only owns the incidental view state. That split matters for the edge cache:
 * these params never change what the server renders, so the HTML cache key
 * deliberately ignores them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous table
const QUERY_PARAMS: readonly UrlParam<any>[] = [
  // Shared
  {
    key: 'filter',
    defaultValue: '',
    ...field<string>('versionFilter'),
    serialize: (value: string) => value,
    deserialize: (encoded: string) => encoded,
  },
  enumParam('window', 'timeWindow', TIME_WINDOWS, 'all'),

  // Breakdown
  {
    key: 'sortBy',
    defaultValue: true,
    ...field<boolean>('sortByVersion'),
    serialize: (byVersion: boolean) => (byVersion ? 'version' : 'downloads'),
    deserialize: (encoded: string) =>
      encoded === 'version'
        ? true
        : encoded === 'downloads'
        ? false
        : undefined,
  },
  {
    key: 'lpf',
    defaultValue: 0.02,
    ...field<number>('lowPassFilter'),
    serialize: (value: number) => (value * 100).toFixed(2),
    deserialize: (encoded: string) => {
      const percent = Number(encoded);
      return encoded !== '' && percent >= 0 && percent <= 100
        ? percent / 100
        : undefined;
    },
  },
  textParam('selectedVersion', 'selectedVersion'),
  listParam('expanded', 'expandedNodes'),
  flagParam('table', 'showDataTable', true),
  {
    // The store holds an index into history that loads after the page, so a
    // date from the URL waits in `pendingSnapshotDate` until it can resolve.
    key: 'snapshot',
    defaultValue: null,
    read: (state: AppState) =>
      state.snapshotIndex !== null
        ? state.snapshots[state.snapshotIndex]?.date ?? null
        : state.pendingSnapshotDate,
    apply: (date: string | null) => ({ pendingSnapshotDate: date }),
    serialize: (date: string | null) => date ?? '',
    deserialize: (encoded: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(encoded) ? encoded : undefined,
  },

  // Adoption
  enumParam(
    'adoption.mode',
    'adoptionChartMode',
    ['stacked', 'lines'],
    'stacked'
  ),
  enumParam('adoption.y', 'adoptionYAxis', ['percent', 'count'], 'percent'),
  enumParam('adoption.group', 'adoptionGrouping', VERSION_LEVELS, 'major'),
  flagParam('adoption.releases', 'adoptionShowReleases', true),
  {
    key: 'adoption.ticks',
    defaultValue: null,
    ...field<'major' | 'minor' | 'patch' | null>('adoptionTickLevel'),
    serialize: (level: string | null) => level ?? '',
    deserialize: (encoded: string) =>
      (VERSION_LEVELS as readonly string[]).includes(encoded)
        ? (encoded as 'major' | 'minor' | 'patch')
        : undefined,
  },
  listParam('adoption.hidden', 'adoptionHidden'),

  // Migration
  enumParam(
    'migration.window',
    'migrationTimeWindow',
    MIGRATION_WINDOWS,
    'all'
  ),
  enumParam('migration.group', 'migrationGranularity', VERSION_LEVELS, 'major'),
  listParam('migration.hidden', 'migrationHidden'),

  // Lifecycle
  numberParam(
    'lifecycle.threshold',
    'lifecycleThreshold',
    50,
    (v) => v > 0 && v <= 100
  ),
  flagParam('lifecycle.snapshotted', 'lifecycleShowOnlySnapshotted', false),
  numberParam(
    'lifecycle.minPeak',
    'lifecycleMinPeak',
    0,
    (v) => v >= 0 && v <= 100
  ),
];

function isDefault<T>(param: UrlParam<T>, value: T) {
  return param.serialize(value) === param.serialize(param.defaultValue);
}

/** Check whether the current page is a package page */
export function isPackagePage(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.includes('/package');
}

/** Parse a query string into store state, using defaults for absent params. */
export function readStateFromSearch(search: string): Partial<AppState> {
  const params = new URLSearchParams(search);
  const state: Partial<AppState> = {};
  for (const param of QUERY_PARAMS) {
    const encoded = params.get(param.key);
    const value = encoded === null ? undefined : param.deserialize(encoded);
    Object.assign(state, param.apply(value ?? param.defaultValue));
  }
  return state;
}

/** Read query params into partial state for store initialization */
export function readInitialStateFromURL(): Partial<AppState> {
  return readStateFromSearch(
    typeof document === 'undefined' ? '' : document.location.search
  );
}

/**
 * Write the store's view state into `search`. Params owned elsewhere are kept,
 * and params at their default are removed.
 */
export function writeStateToSearch(state: AppState, search: string): string {
  const params = new URLSearchParams(search);
  for (const param of QUERY_PARAMS) {
    const value = param.read(state);
    if (isDefault(param, value)) {
      params.delete(param.key);
    } else {
      params.set(param.key, param.serialize(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Fired after the query string changes without a navigation. */
export const URL_CHANGE_EVENT = 'npm-burst:urlchange';

/**
 * Push current URL-synced state to the query string, leaving the path (and
 * therefore the package and tab) untouched.
 */
export function pushStateToURL(state: AppState) {
  if (typeof document === 'undefined') return;
  if (!isPackagePage()) return;

  const search = writeStateToSearch(state, window.location.search);
  if (search !== window.location.search) {
    window.history.replaceState(
      window.history.state,
      document.title,
      `${window.location.pathname}${search}`
    );
    window.dispatchEvent(new Event(URL_CHANGE_EVENT));
  }
}

/** Subscribe to store changes and push URL-synced fields */
export function subscribeToURLSync(store: StoreApi<AppState>): () => void {
  return store.subscribe((state, prevState) => {
    if (
      QUERY_PARAMS.some((param) => param.read(state) !== param.read(prevState))
    ) {
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
    store.getState().applyURLState(readInitialStateFromURL());
  };

  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
}
