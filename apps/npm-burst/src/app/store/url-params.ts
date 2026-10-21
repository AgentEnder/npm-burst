/**
 * The page's view state as a query string.
 *
 * Pure, with no DOM and no store, so the Worker can read a shared URL exactly
 * the way the page does (the social card route does). The browser side, which
 * keeps the address bar and the store in step, is `url-sync.ts`.
 */

import type { MigrationTimeWindow, TimeWindow } from '../utils/time-window';

export type VersionLevel = 'major' | 'minor' | 'patch';

/** Store fields that round-trip through the query string. */
export interface UrlViewState {
  sortByVersion: boolean;
  lowPassFilter: number;
  selectedVersion: string | null;
  expandedNodes: string[];
  showDataTable: boolean;

  /** Snapshot date from the URL, resolved once snapshot history loads. */
  pendingSnapshotDate: string | null;

  /** Version filter shared by the Breakdown, Adoption and Migration tabs. */
  versionFilter: string;
  timeWindow: TimeWindow;
  adoptionChartMode: 'stacked' | 'lines';
  adoptionYAxis: 'percent' | 'count';
  adoptionGrouping: VersionLevel;
  adoptionShowReleases: boolean;
  /** Release tick level; `null` follows the grouping. */
  adoptionTickLevel: VersionLevel | null;
  adoptionHidden: string[];
  migrationTimeWindow: MigrationTimeWindow;
  migrationGranularity: VersionLevel;
  migrationHidden: string[];
  lifecycleThreshold: number;
  lifecycleShowOnlySnapshotted: boolean;
  lifecycleMinPeak: number;
}

/**
 * What writing the URL reads. The `snapshot` param is written from the
 * selected snapshot's date, so it needs the history as well as the fields.
 */
export interface UrlStateSource extends UrlViewState {
  snapshotIndex: number | null;
  snapshots: readonly { date: string }[];
}

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
  read: (state: UrlStateSource) => T;
  apply: (value: T) => Partial<UrlViewState>;
  serialize: (value: T) => string;
  /** Returns `undefined` for a value the URL cannot represent. */
  deserialize: (encoded: string) => T | undefined;
}

type FieldOf<T> = {
  [K in keyof UrlViewState]: UrlViewState[K] extends T ? K : never;
}[keyof UrlViewState];

function field<T>(name: FieldOf<T>) {
  return {
    read: (state: UrlStateSource) => state[name] as T,
    apply: (value: T) => ({ [name]: value } as Partial<UrlViewState>),
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
    read: (state: UrlStateSource) =>
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

/**
 * Canonical query string for the params named in `keys`.
 *
 * Other params, unparseable values and defaults are dropped, and the rest are
 * re-serialized in table order. Two URLs showing the same view therefore
 * canonicalize to the same string.
 */
export function canonicalSearch(
  search: string,
  keys: readonly string[]
): string {
  const params = new URLSearchParams(search);
  const canonical = new URLSearchParams();
  for (const param of QUERY_PARAMS) {
    if (!keys.includes(param.key)) continue;
    const encoded = params.get(param.key);
    if (encoded === null) continue;
    const value = param.deserialize(encoded);
    if (value === undefined || isDefault(param, value)) continue;
    canonical.set(param.key, param.serialize(value));
  }
  const query = canonical.toString();
  return query ? `?${query}` : '';
}

/** Parse a query string into store state, using defaults for absent params. */
export function readStateFromSearch(search: string): Partial<UrlViewState> {
  const params = new URLSearchParams(search);
  const state: Partial<UrlViewState> = {};
  for (const param of QUERY_PARAMS) {
    const encoded = params.get(param.key);
    const value = encoded === null ? undefined : param.deserialize(encoded);
    Object.assign(state, param.apply(value ?? param.defaultValue));
  }
  return state;
}

/**
 * Write the store's view state into `search`. Params owned elsewhere are kept,
 * and params at their default are removed.
 */
export function writeStateToSearch(
  state: UrlStateSource,
  search: string
): string {
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

/** Whether any URL-backed value differs between the two states. */
export function urlStateChanged(
  state: UrlStateSource,
  prevState: UrlStateSource
): boolean {
  return QUERY_PARAMS.some(
    (param) => param.read(state) !== param.read(prevState)
  );
}
