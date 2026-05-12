import {
  getDownloadsByVersion,
  getTotalDownloadsRange,
} from '@npm-burst/npm-data-access';
import type { ExternalDataWarning } from '../../server/external-data';
import { useEffect, useRef, useState } from 'react';
import { onGetDownloads } from '../../server/functions/downloads.telefunc';
import { onGetHealthMetrics } from '../../server/functions/health.telefunc';
import { onGetSnapshots } from '../../server/functions/snapshots.telefunc';
import { onGetTotalDownloads } from '../../server/functions/total-downloads.telefunc';
import { onGetVersionDates } from '../../server/functions/versions.telefunc';
import { useWarningToast } from './use-warning-toast';
import { useSafeAuth } from '../context/auth-context';
import { appStore, useAppStore } from '../store';

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
  const [warnings, setWarnings] = useState<ExternalDataWarning[]>([]);

  useWarningToast(`package:${npmPackageName}`, warnings);

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
    store.setHealth(null);
    setWarnings([]);

    let cancelled = false;

    const fetchLive = isSignedIn
      ? onGetDownloads(npmPackageName).catch(() => ({
          data: null,
          warnings: [],
        }))
      : (() => {
          const { get, cancel } = getDownloadsByVersion(npmPackageName);
          cancelRef.current = cancel;
          return get()
            .then((data) => ({ data, warnings: [] }))
            .catch(() => ({ data: null, warnings: [] }));
        })();

    const fetchSnapshots = onGetSnapshots(npmPackageName)
      .then(({ snapshots }) => snapshots)
      .catch(() => []);

    const fetchVersions = onGetVersionDates(npmPackageName).catch(() => ({
      versions: [],
      warnings: [],
    }));

    // Fetch total downloads for last 18 months (npm API max range)
    const end = new Date().toISOString().slice(0, 10);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 18);
    const start = startDate.toISOString().slice(0, 10);

    const fetchTotalDownloads = isSignedIn
      ? onGetTotalDownloads(npmPackageName, start, end).catch(() => ({
          downloads: [],
          warnings: [],
        }))
      : (() => {
          const { get } = getTotalDownloadsRange(npmPackageName, start, end);
          return get()
            .then((data) => ({ downloads: data.downloads, warnings: [] }))
            .catch(() => ({ downloads: [], warnings: [] }));
        })();

    const fetchHealth = onGetHealthMetrics(npmPackageName).catch(() => null);

    Promise.all([
      fetchLive,
      fetchSnapshots,
      fetchVersions,
      fetchTotalDownloads,
      fetchHealth,
    ])
      .then(
        ([
          liveResult,
          snapshots,
          versionsResult,
          totalDownloadsResult,
          health,
        ]) => {
          if (cancelled) return;
          const s = appStore.getState();
          s.setLiveData(liveResult.data);
          s.setSnapshots(snapshots);
          s.setVersionReleases(versionsResult.versions);
          s.setTotalDownloads(totalDownloadsResult.downloads);
          s.setHealth(health);
          s.setSnapshotIndex(null);
          s.cacheCurrentPackageData();
          s.recomputeChartData();
          const warnings = [
            ...liveResult.warnings,
            ...versionsResult.warnings,
            ...totalDownloadsResult.warnings,
            ...(health?.warnings ?? []),
          ];
          setWarnings(warnings);
        }
      )
      .catch((e) => {
        if (cancelled || e?.name === 'AbortError') return;
        appStore
          .getState()
          .setError(
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
