import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { DailyDownloadPoint } from '../../server/functions/total-downloads.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import type { PackageHealthResponse } from '../../server/functions/health.telefunc';
import type { SunburstData } from '../components/sunburst';
import {
  findNodeByVersion,
  getParentOfAggregatedNode,
  getSunburstDataFromDownloads,
} from '../utils/chart-data';
import { buildPackagePath, type PackageTab } from '../utils/package-route';
import {
  readPackageDataCache,
  writePackageDataCache,
} from '../utils/package-data-cache';
import {
  listenForURLChanges,
  readInitialStateFromURL,
  subscribeToURLSync,
} from './url-sync';

interface PackageCache {
  liveData: NpmDownloadsByVersion | null;
  snapshots: Snapshot[];
  versionReleases: VersionRelease[];
  totalDownloads: DailyDownloadPoint[];
  health: PackageHealthResponse | null;
}

export interface AppState {
  // URL-synced state
  npmPackageName: string;
  sortByVersion: boolean;
  lowPassFilter: number;
  selectedVersion: string | null;
  expandedNodes: string[];

  // Fetched data
  liveData: NpmDownloadsByVersion | null;
  snapshots: Snapshot[];
  versionReleases: VersionRelease[];
  totalDownloads: DailyDownloadPoint[];
  health: PackageHealthResponse | null;

  // Per-package cache
  packageCache: Record<string, PackageCache>;

  // Snapshot navigation
  snapshotIndex: number | null;

  // Derived
  sunburstChartData: SunburstData | null;

  // UI
  isLoading: boolean;
  /**
   * The snapshot history loads in the background after the first paint, so it
   * gets its own flag — it must never gate the main loading skeleton.
   */
  isLoadingHistory: boolean;
  /**
   * Cached data is on screen and a background re-fetch is replacing it.
   * Never gates rendering — only hints that newer numbers may land.
   */
  isRevalidating: boolean;
  /**
   * The health report shown may be a stale cached copy (and its
   * `githubUserAuthAvailable` may predate a sign-in change), so manual
   * refreshes wait for this to clear.
   */
  isRevalidatingHealth: boolean;
  error: string | null;
  showDataTable: boolean;
  /** Active tab, mirrored from the route by `seedPackageStore` */
  viewMode: PackageTab;
  /** Incremented to force re-fetch after cache invalidation */
  fetchGeneration: number;

  // Chart controls
  timeWindow: '30d' | '90d' | '6mo' | '1y' | 'all';
  migrationTimeWindow: '90d' | '180d' | '1y' | 'all';
  migrationGranularity: 'major' | 'minor' | 'patch';
  sunburstVersionFilter: string;
  lifecycleShowOnlySnapshotted: boolean;
  lifecycleMinPeak: number;

  // Actions
  setNpmPackageName: (pkg: string) => void;
  setSortByVersion: (v: boolean) => void;
  setLowPassFilter: (v: number) => void;
  setSelectedVersion: (v: string | null) => void;
  setExpandedNodes: (nodes: string[]) => void;

  setLiveData: (data: NpmDownloadsByVersion | null) => void;
  setSnapshots: (snapshots: Snapshot[]) => void;
  /**
   * Replace the history with a (larger) oldest-first list as pages arrive,
   * keeping any selected snapshot pinned to its date rather than its index.
   */
  applySnapshotHistory: (snapshots: Snapshot[]) => void;
  setVersionReleases: (releases: VersionRelease[]) => void;
  setTotalDownloads: (downloads: DailyDownloadPoint[]) => void;
  setHealth: (health: PackageHealthResponse | null) => void;

  setSnapshotIndex: (idx: number | null) => void;
  previousSnapshot: () => void;
  nextSnapshot: () => void;
  goLive: () => void;
  selectSnapshotDate: (date: string) => void;

  handleVersionClick: (version: string | null, isAggregated?: boolean) => void;
  selectPackage: (pkg: string) => void;
  resetSelection: () => void;

  setLoading: (v: boolean) => void;
  setLoadingHistory: (v: boolean) => void;
  setRevalidating: (v: boolean) => void;
  setRevalidatingHealth: (v: boolean) => void;
  setError: (v: string | null) => void;
  setShowDataTable: (v: boolean) => void;
  setViewMode: (v: PackageTab) => void;
  setTimeWindow: (v: '30d' | '90d' | '6mo' | '1y' | 'all') => void;
  setMigrationTimeWindow: (v: '90d' | '180d' | '1y' | 'all') => void;
  setMigrationGranularity: (v: 'major' | 'minor' | 'patch') => void;
  setSunburstVersionFilter: (v: string) => void;
  setLifecycleShowOnlySnapshotted: (v: boolean) => void;
  setLifecycleMinPeak: (v: number) => void;

  recomputeChartData: () => void;
  /** Save the current package's data to the in-memory and local caches. */
  cacheCurrentPackageData: () => void;
  /**
   * Paint `pkg` from the in-memory cache, falling back to localStorage.
   * Returns whether anything was restored. Callers still revalidate.
   */
  restoreFromCache: (pkg: string) => boolean;
  /** Clear cache for current package to force a re-fetch */
  invalidateCache: () => void;
}

function getSourceData(state: {
  snapshotIndex: number | null;
  snapshots: Snapshot[];
  npmPackageName: string;
  liveData: NpmDownloadsByVersion | null;
}): NpmDownloadsByVersion | null {
  if (state.snapshotIndex !== null && state.snapshots[state.snapshotIndex]) {
    return {
      downloads: state.snapshots[state.snapshotIndex].downloads,
      package: state.npmPackageName,
    };
  }
  if (state.liveData) return state.liveData;

  // Live download counts come from the npm registry and arrive after
  // hydration. Until then, fall back to the newest snapshot — which `+data`
  // inlines into the HTML — so the chart paints immediately instead of
  // waiting on a network round-trip.
  const newest = state.snapshots[state.snapshots.length - 1];
  if (newest) {
    return { downloads: newest.downloads, package: state.npmPackageName };
  }
  return null;
}

/**
 * The seeded (server-rendered) report and a cached one can both be on hand;
 * keep whichever was refreshed more recently. On a tie the cached copy wins,
 * since only it can carry the user-specific `githubUserAuthAvailable`.
 */
function pickFresherHealth(
  seeded: PackageHealthResponse | null,
  cached: PackageHealthResponse | null
): PackageHealthResponse | null {
  if (!seeded) return cached;
  if (!cached) return seeded;
  const seededAt = seeded.lastRefreshedAt ?? '';
  const cachedAt = cached.lastRefreshedAt ?? '';
  return seededAt > cachedAt ? seeded : cached;
}

const initialURL = readInitialStateFromURL();

export const appStore = createStore<AppState>((set, get) => ({
  // The package and tab come from the route (seeded via `seedPackageStore`),
  // not the query string — only view state is URL-synced here.
  npmPackageName: 'nx',
  sortByVersion: (initialURL.sortByVersion as boolean) ?? true,
  lowPassFilter: (initialURL.lowPassFilter as number) ?? 0.02,
  selectedVersion: (initialURL.selectedVersion as string | null) ?? null,
  expandedNodes: (initialURL.expandedNodes as string[]) ?? [],

  // Data
  liveData: null,
  snapshots: [],
  versionReleases: [],
  totalDownloads: [],
  health: null,
  packageCache: {},

  // Navigation
  snapshotIndex: null,

  // Derived
  sunburstChartData: null,

  // UI
  isLoading: false,
  isLoadingHistory: false,
  isRevalidating: false,
  isRevalidatingHealth: false,
  error: null,
  fetchGeneration: 0,
  showDataTable: true,
  viewMode: 'sunburst',
  timeWindow: 'all',
  migrationTimeWindow: 'all',
  migrationGranularity: 'major',
  sunburstVersionFilter: '',
  lifecycleShowOnlySnapshotted: false,
  lifecycleMinPeak: 0,

  // === Actions ===

  setNpmPackageName: (pkg) => set({ npmPackageName: pkg }),
  setSortByVersion: (v) => {
    set({ sortByVersion: v });
    get().recomputeChartData();
  },
  setLowPassFilter: (v) => {
    set({ lowPassFilter: v });
    get().recomputeChartData();
  },
  setSelectedVersion: (v) => set({ selectedVersion: v }),
  setExpandedNodes: (nodes) => {
    set({ expandedNodes: nodes });
    get().recomputeChartData();
  },

  setLiveData: (data) => set({ liveData: data }),
  setSnapshots: (snapshots) => set({ snapshots }),
  applySnapshotHistory: (snapshots) => {
    const {
      snapshots: current,
      snapshotIndex,
      npmPackageName,
      packageCache,
    } = get();
    const selectedDate =
      snapshotIndex !== null ? current[snapshotIndex]?.date : undefined;
    const nextIndex =
      selectedDate !== undefined
        ? snapshots.findIndex((s) => s.date === selectedDate)
        : -1;
    const cached = packageCache[npmPackageName];
    set({
      snapshots,
      snapshotIndex: nextIndex === -1 ? null : nextIndex,
      ...(cached
        ? {
            packageCache: {
              ...packageCache,
              [npmPackageName]: { ...cached, snapshots },
            },
          }
        : {}),
    });
    get().recomputeChartData();
  },
  setVersionReleases: (releases) => set({ versionReleases: releases }),
  setTotalDownloads: (downloads) => set({ totalDownloads: downloads }),
  setHealth: (health) => set({ health }),

  setSnapshotIndex: (idx) => {
    set({ snapshotIndex: idx });
    get().recomputeChartData();
  },

  previousSnapshot: () => {
    const { snapshots, snapshotIndex } = get();
    if (snapshots.length === 0) return;
    if (snapshotIndex === null) {
      set({ snapshotIndex: snapshots.length - 1 });
    } else if (snapshotIndex > 0) {
      set({ snapshotIndex: snapshotIndex - 1 });
    }
    get().recomputeChartData();
  },

  nextSnapshot: () => {
    const { snapshots, snapshotIndex } = get();
    if (snapshotIndex === null) return;
    if (snapshotIndex >= snapshots.length - 1) {
      set({ snapshotIndex: null });
    } else {
      set({ snapshotIndex: snapshotIndex + 1 });
    }
    get().recomputeChartData();
  },

  goLive: () => {
    set({ snapshotIndex: null });
    get().recomputeChartData();
  },

  selectSnapshotDate: (date) => {
    const { snapshots } = get();
    const idx = snapshots.findIndex((s) => s.date === date);
    if (idx !== -1) {
      set({ snapshotIndex: idx });
      get().recomputeChartData();
    }
  },

  handleVersionClick: (version, isAggregated) => {
    const { expandedNodes } = get();
    if (!version) {
      set({ selectedVersion: null });
      return;
    }
    if (isAggregated) {
      if (!expandedNodes.includes(version)) {
        set({ expandedNodes: [...expandedNodes, version] });
      }
      set({ selectedVersion: getParentOfAggregatedNode(version) });
      get().recomputeChartData();
    } else {
      set({ selectedVersion: version });
    }
  },

  selectPackage: (pkg) => {
    // The package lives in the path, so switching packages is a navigation.
    // Vike's client router picks the link up and re-runs `+data`.
    if (typeof window !== 'undefined') {
      window.location.href = buildPackagePath(pkg, get().viewMode);
    }
  },

  resetSelection: () => {
    set({ selectedVersion: null, expandedNodes: [] });
    get().recomputeChartData();
  },

  setLoading: (v) => set({ isLoading: v }),
  setLoadingHistory: (v) => set({ isLoadingHistory: v }),
  setRevalidating: (v) => set({ isRevalidating: v }),
  setRevalidatingHealth: (v) => set({ isRevalidatingHealth: v }),
  setError: (v) => set({ error: v }),
  setShowDataTable: (v) => set({ showDataTable: v }),
  setViewMode: (v) => {
    const updates: Partial<AppState> = { viewMode: v };
    if (v !== 'sunburst') {
      updates.snapshotIndex = null;
    }
    set(updates);
    if (v !== 'sunburst') {
      get().recomputeChartData();
    }
  },
  setTimeWindow: (v) => set({ timeWindow: v }),
  setMigrationTimeWindow: (v) => set({ migrationTimeWindow: v }),
  setMigrationGranularity: (v) => set({ migrationGranularity: v }),
  setSunburstVersionFilter: (v) => {
    set({ sunburstVersionFilter: v });
    get().recomputeChartData();
  },
  setLifecycleShowOnlySnapshotted: (v) =>
    set({ lifecycleShowOnlySnapshotted: v }),
  setLifecycleMinPeak: (v) => set({ lifecycleMinPeak: v }),

  recomputeChartData: () => {
    const state = get();
    const sourceData = getSourceData(state);

    if (!sourceData) {
      set({ sunburstChartData: null });
      return;
    }

    const chartData = getSunburstDataFromDownloads(
      sourceData,
      state.lowPassFilter,
      state.expandedNodes,
      state.sunburstVersionFilter
    );

    // If selectedVersion doesn't exist in the new data, reset it
    let { selectedVersion } = state;
    if (selectedVersion && !findNodeByVersion(chartData, selectedVersion)) {
      selectedVersion = null;
    }

    set({ sunburstChartData: chartData, selectedVersion });
  },

  cacheCurrentPackageData: () => {
    const {
      npmPackageName,
      liveData,
      snapshots,
      versionReleases,
      totalDownloads,
      health,
      packageCache,
    } = get();
    set({
      packageCache: {
        ...packageCache,
        [npmPackageName]: {
          liveData,
          snapshots,
          versionReleases,
          totalDownloads,
          health,
        },
      },
    });
    // Snapshots are left out: they have their own incremental cache.
    writePackageDataCache(npmPackageName, {
      liveData,
      versionReleases,
      totalDownloads,
      health: health?.packageName === npmPackageName ? health : null,
    });
  },

  restoreFromCache: (pkg) => {
    const { packageCache, health: current } = get();
    const memory = packageCache[pkg];
    const cached = memory ?? readPackageDataCache(pkg);
    if (!cached) return false;
    set({
      liveData: cached.liveData,
      ...(memory ? { snapshots: memory.snapshots } : {}),
      versionReleases: cached.versionReleases,
      totalDownloads: cached.totalDownloads,
      health: pickFresherHealth(
        current?.packageName === pkg ? current : null,
        cached.health
      ),
      snapshotIndex: null,
    });
    return true;
  },

  invalidateCache: () => {
    const { npmPackageName, packageCache } = get();
    const next = { ...packageCache };
    delete next[npmPackageName];
    // Clear cache and bump fetchGeneration to trigger re-fetch
    set({
      packageCache: next,
      liveData: null,
      health: null,
      error: null,
      fetchGeneration: get().fetchGeneration + 1,
    });
  },
}));

// Set up URL sync
if (typeof window !== 'undefined') {
  subscribeToURLSync(appStore);
  listenForURLChanges(appStore);
}

// React hook
export function useAppStore(): AppState;
export function useAppStore<T>(selector: (s: AppState) => T): T;
export function useAppStore<T>(selector?: (s: AppState) => T) {
  return useStore(appStore, selector as (s: AppState) => T);
}
