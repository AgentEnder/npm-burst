import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { NpmDownloadsByVersion } from '@npm-burst/npm/data-access';
import type { SunburstData } from '../components/sunburst';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import {
  getSunburstDataFromDownloads,
  findNodeByVersion,
  getParentOfAggregatedNode,
} from '../utils/chart-data';
import {
  readInitialStateFromURL,
  subscribeToURLSync,
  listenForURLChanges,
  isPackagePage,
} from './url-sync';

interface PackageCache {
  liveData: NpmDownloadsByVersion;
  snapshots: Snapshot[];
  versionReleases: VersionRelease[];
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

  // Per-package cache
  packageCache: Record<string, PackageCache>;

  // Snapshot navigation
  snapshotIndex: number | null;

  // Derived
  sunburstChartData: SunburstData | null;

  // UI
  isLoading: boolean;
  error: string | null;
  showDataTable: boolean;
  /** Incremented to force re-fetch after cache invalidation */
  fetchGeneration: number;

  // Actions
  setNpmPackageName: (pkg: string) => void;
  setSortByVersion: (v: boolean) => void;
  setLowPassFilter: (v: number) => void;
  setSelectedVersion: (v: string | null) => void;
  setExpandedNodes: (nodes: string[]) => void;

  setLiveData: (data: NpmDownloadsByVersion | null) => void;
  setSnapshots: (snapshots: Snapshot[]) => void;
  setVersionReleases: (releases: VersionRelease[]) => void;

  setSnapshotIndex: (idx: number | null) => void;
  previousSnapshot: () => void;
  nextSnapshot: () => void;
  goLive: () => void;
  selectSnapshotDate: (date: string) => void;

  handleVersionClick: (version: string | null, isAggregated?: boolean) => void;
  selectPackage: (pkg: string) => void;
  resetSelection: () => void;

  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  setShowDataTable: (v: boolean) => void;

  recomputeChartData: () => void;
  cacheCurrentPackageData: () => void;
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
  return state.liveData;
}

const initialURL = readInitialStateFromURL();

export const appStore = createStore<AppState>((set, get) => ({
  // URL-synced (initialized from URL)
  npmPackageName: (initialURL.npmPackageName as string) ?? 'nx',
  sortByVersion: (initialURL.sortByVersion as boolean) ?? true,
  lowPassFilter: (initialURL.lowPassFilter as number) ?? 0.02,
  selectedVersion: (initialURL.selectedVersion as string | null) ?? null,
  expandedNodes: (initialURL.expandedNodes as string[]) ?? [],

  // Data
  liveData: null,
  snapshots: [],
  versionReleases: [],
  packageCache: {},

  // Navigation
  snapshotIndex: null,

  // Derived
  sunburstChartData: null,

  // UI
  isLoading: false,
  error: null,
  fetchGeneration: 0,
  showDataTable: true,

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
  setVersionReleases: (releases) => set({ versionReleases: releases }),

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
    if (typeof window !== 'undefined' && !isPackagePage()) {
      // Navigate to the package page — the hash will carry the package name
      const base = window.location.pathname.split('/package')[0];
      window.location.href = `${base}/package#/${encodeURIComponent(pkg)}`;
      return;
    }

    // Update store state — subscribeToURLSync will push the hash automatically
    set({
      npmPackageName: pkg,
      selectedVersion: null,
      expandedNodes: [],
      snapshotIndex: null,
    });
  },

  resetSelection: () => {
    set({ selectedVersion: null, expandedNodes: [] });
    get().recomputeChartData();
  },

  setLoading: (v) => set({ isLoading: v }),
  setError: (v) => set({ error: v }),
  setShowDataTable: (v) => set({ showDataTable: v }),

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
      state.expandedNodes
    );

    // If selectedVersion doesn't exist in the new data, reset it
    let { selectedVersion } = state;
    if (selectedVersion && !findNodeByVersion(chartData, selectedVersion)) {
      selectedVersion = null;
    }

    set({ sunburstChartData: chartData, selectedVersion });
  },

  cacheCurrentPackageData: () => {
    const { npmPackageName, liveData, snapshots, versionReleases, packageCache } = get();
    if (!liveData) return;
    set({
      packageCache: {
        ...packageCache,
        [npmPackageName]: { liveData, snapshots, versionReleases },
      },
    });
  },

  restoreFromCache: (pkg) => {
    const { packageCache } = get();
    const cached = packageCache[pkg];
    if (!cached) return false;
    set({
      liveData: cached.liveData,
      snapshots: cached.snapshots,
      versionReleases: cached.versionReleases,
      snapshotIndex: null,
    });
    return true;
  },

  invalidateCache: () => {
    const { npmPackageName, packageCache } = get();
    const next = { ...packageCache };
    delete next[npmPackageName];
    // Clear cache and bump fetchGeneration to trigger re-fetch
    set({ packageCache: next, liveData: null, error: null, fetchGeneration: get().fetchGeneration + 1 });
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
