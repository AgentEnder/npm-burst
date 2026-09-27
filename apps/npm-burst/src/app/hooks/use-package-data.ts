import {
  getDownloadsByVersion,
  getTotalDownloadsRange,
  type NpmDownloadsByVersion,
} from '@npm-burst/npm-data-access';
import type { ExternalDataWarning } from '../../server/external-data';
import { useEffect, useRef, useState } from 'react';
import { onGetDownloads } from '../../server/functions/downloads.telefunc';
import { onGetHealthMetrics } from '../../server/functions/health.telefunc';
import { onGetSnapshots } from '../../server/functions/snapshots.telefunc';
import {
  onGetTotalDownloads,
  type DailyDownloadPoint,
} from '../../server/functions/total-downloads.telefunc';
import { onGetVersionDates } from '../../server/functions/versions.telefunc';
import {
  loadSnapshotHistory,
  mergeSnapshots,
  SNAPSHOT_PAGE_SIZE,
  readSnapshotCache,
  writeSnapshotCache,
} from '../utils/snapshot-cache';
import { useWarningToast } from './use-warning-toast';
import { useSafeAuth } from '../context/auth-context';
import { appStore, useAppStore } from '../store';

/**
 * The server falls back to an empty list plus a warning when an upstream call
 * fails. That is fine to show with nothing cached, but it must not replace a
 * cached list during revalidation.
 */
function isDegraded(
  list: unknown[],
  result: { warnings: ExternalDataWarning[] }
): boolean {
  return list.length === 0 && result.warnings.length > 0;
}

/**
 * Orchestrates data fetching when the package name changes, using
 * stale-while-revalidate: whatever was loaded last time (in memory for this
 * session, else from localStorage) paints immediately, then every data point is
 * re-fetched in the background and swapped in as soon as it arrives. The
 * loading skeleton only shows when there is nothing cached at all.
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

    const pkg = npmPackageName;
    const store = appStore.getState();
    const hasCache = store.restoreFromCache(pkg);

    store.setError(null);
    setWarnings([]);
    if (!hasCache) {
      // Nothing to show stale, so clear the previous package's data rather
      // than let it stand in for this one. Seeded snapshots and health (from
      // `+data`) already belong to this package and stay.
      store.setLiveData(null);
      store.setVersionReleases([]);
      store.setTotalDownloads([]);
      if (appStore.getState().health?.packageName !== pkg) {
        store.setHealth(null);
      }
      store.setLoading(true);
    }
    store.recomputeChartData();
    store.setRevalidating(true);
    store.setRevalidatingHealth(true);

    let cancelled = false;

    // Each fetch resolves to `null` on failure, so a failed revalidation
    // leaves the cached value on screen instead of blanking it.
    const fetchLive: Promise<{
      data: NpmDownloadsByVersion | null;
      warnings: ExternalDataWarning[];
    } | null> = isSignedIn
      ? onGetDownloads(pkg).catch(() => null)
      : (() => {
          const { get, cancel } = getDownloadsByVersion(pkg);
          cancelRef.current = cancel;
          return get()
            .then((data) => ({ data, warnings: [] }))
            .catch(() => null);
        })();

    // The snapshot history is the heaviest payload and nothing on the first
    // paint needs it — `+data` already inlined the newest snapshot, which is
    // all the sunburst reads. So it loads alongside, on its own flag, instead
    // of inside the Promise.all that gates the loading skeleton.
    //
    // It is paged newest → oldest and mirrored into localStorage, so a repeat
    // visit paints the cached history immediately and only fetches the pages
    // newer than the cache (plus any tail an earlier visit didn't finish).
    const seeded = appStore.getState().snapshots;
    store.setLoadingHistory(true);
    loadSnapshotHistory({
      cached: readSnapshotCache(pkg),
      pageSize: SNAPSHOT_PAGE_SIZE,
      fetchPage: (options) => onGetSnapshots(pkg, options),
      shouldContinue: () => !cancelled,
      onProgress: ({ snapshots, complete, contiguous }) => {
        if (cancelled) return;
        if (contiguous && snapshots.length > 0) {
          writeSnapshotCache(pkg, { snapshots, complete });
        }
        appStore
          .getState()
          .applySnapshotHistory(mergeSnapshots(seeded, snapshots));
      },
    })
      .catch(() => {
        /* history is additive — the seeded/cached snapshots still render */
      })
      .finally(() => {
        if (!cancelled) appStore.getState().setLoadingHistory(false);
      });

    const fetchVersions = onGetVersionDates(pkg).catch(() => null);

    // Fetch total downloads for last 18 months (npm API max range)
    const end = new Date().toISOString().slice(0, 10);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 18);
    const start = startDate.toISOString().slice(0, 10);

    const fetchTotalDownloads: Promise<{
      downloads: DailyDownloadPoint[];
      warnings: ExternalDataWarning[];
    } | null> = isSignedIn
      ? onGetTotalDownloads(pkg, start, end).catch(() => null)
      : (() => {
          const { get } = getTotalDownloadsRange(pkg, start, end);
          return get()
            .then((data) => ({ downloads: data.downloads, warnings: [] }))
            .catch(() => null);
        })();

    const fetchHealth = onGetHealthMetrics(pkg).catch(() => null);

    // Swap each data point in the moment it lands rather than waiting on the
    // slowest one.
    const applied = [
      fetchLive.then((result) => {
        if (cancelled || !result?.data) return result;
        const s = appStore.getState();
        s.setLiveData(result.data);
        s.recomputeChartData();
        return result;
      }),
      fetchVersions.then((result) => {
        if (!cancelled && result && !isDegraded(result.versions, result)) {
          appStore.getState().setVersionReleases(result.versions);
        }
        return result;
      }),
      fetchTotalDownloads.then((result) => {
        if (!cancelled && result && !isDegraded(result.downloads, result)) {
          appStore.getState().setTotalDownloads(result.downloads);
        }
        return result;
      }),
      fetchHealth
        .then((health) => {
          if (!cancelled && health) {
            const current = appStore.getState().health;
            // The server answers a failed load with an empty report plus a
            // warning; don't let that replace a real one already on screen.
            const lostData =
              health.warnings.length > 0 &&
              health.snapshots.length === 0 &&
              current?.packageName === pkg &&
              current.snapshots.length > 0;
            if (!lostData) appStore.getState().setHealth(health);
          }
          return health;
        })
        .finally(() => {
          if (!cancelled) appStore.getState().setRevalidatingHealth(false);
        }),
    ] as const;

    Promise.all(applied)
      .then(([liveResult, versionsResult, totalDownloadsResult, health]) => {
        if (cancelled) return;
        appStore.getState().cacheCurrentPackageData();
        setWarnings([
          ...(liveResult?.warnings ?? []),
          ...(versionsResult?.warnings ?? []),
          ...(totalDownloadsResult?.warnings ?? []),
          ...(health?.warnings ?? []),
        ]);
      })
      .catch((e) => {
        if (cancelled || e?.name === 'AbortError') return;
        // With cached data on screen, a failed revalidation is not worth
        // replacing the page over.
        if (hasCache) return;
        appStore
          .getState()
          .setError(
            `Failed to load data for "${pkg}". The package may not exist or there was a network error.`
          );
      })
      .finally(() => {
        if (!cancelled) {
          const s = appStore.getState();
          s.setLoading(false);
          s.setRevalidating(false);
        }
      });

    return () => {
      cancelled = true;
      cancelRef.current?.();
      cancelRef.current = null;
    };
  }, [npmPackageName, isSignedIn, fetchGeneration]);
}
