import { useEffect, useRef } from 'react';
import { getDownloadsByVersion } from '@npm-burst/npm/data-access';
import { onGetDownloads } from '../../server/functions/downloads.telefunc';
import { onGetSnapshots } from '../../server/functions/snapshots.telefunc';
import { onGetVersionDates } from '../../server/functions/versions.telefunc';
import { appStore, useAppStore } from '../store';
import { useSafeAuth } from '../context/auth-context';

/**
 * Orchestrates data fetching when the package name changes.
 * Checks the store's packageCache first to avoid redundant API calls.
 */
export function usePackageData() {
  const { isSignedIn } = useSafeAuth();
  const npmPackageName = useAppStore((s) => s.npmPackageName);
  // fetchGeneration is used only in the dep array to trigger re-fetch after cache invalidation
  const fetchGeneration = useAppStore((s) => s.fetchGeneration); // eslint-disable-line @typescript-eslint/no-unused-vars
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!npmPackageName) return;

    // Cancel any in-flight request
    cancelRef.current?.();
    cancelRef.current = null;

    const store = appStore.getState();

    // Check cache first
    if (store.restoreFromCache(npmPackageName)) {
      store.recomputeChartData();
      return;
    }

    // Cache miss — fetch everything in parallel
    store.setLoading(true);
    store.setError(null);

    let cancelled = false;

    const fetchLive = isSignedIn
      ? onGetDownloads(npmPackageName)
      : (() => {
          const { get, cancel } = getDownloadsByVersion(npmPackageName);
          cancelRef.current = cancel;
          return get();
        })();

    const fetchSnapshots = onGetSnapshots(npmPackageName)
      .then(({ snapshots }) => snapshots)
      .catch(() => []);

    const fetchVersions = onGetVersionDates(npmPackageName)
      .then(({ versions }) => versions)
      .catch(() => []);

    Promise.all([fetchLive, fetchSnapshots, fetchVersions])
      .then(([liveData, snapshots, versions]) => {
        if (cancelled) return;
        const s = appStore.getState();
        s.setLiveData(liveData);
        s.setSnapshots(snapshots);
        s.setVersionReleases(versions);
        s.setSnapshotIndex(null);
        s.cacheCurrentPackageData();
        s.recomputeChartData();
      })
      .catch((e) => {
        if (cancelled || e?.name === 'AbortError') return;
        appStore.getState().setError(
          `Failed to load data for "${npmPackageName}". The package may not exist or there was a network error.`
        );
      })
      .finally(() => {
        if (!cancelled) {
          appStore.getState().setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      cancelRef.current?.();
      cancelRef.current = null;
    };
  }, [npmPackageName, isSignedIn, fetchGeneration]);
}
