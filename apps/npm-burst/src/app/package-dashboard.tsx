import { useEffect, useMemo, useState } from 'react';
import type { PackageDetailData } from '../pages/package-detail/+data';
import { seedPackageStore } from './store/seed';
import { Card } from './components/card';
import { DashboardHeader } from './components/dashboard-header';
import styles from './components/dashboard-header.module.scss';
import { ErrorMessage } from './components/error-message';
import { LoadingSkeleton } from './components/loading-skeleton';
import { SnapshotControls } from './components/snapshot-controls';
import { HealthReport } from './components/health-report';
import {
  Sunburst,
  SunburstData,
  SunburstLeafNode,
} from './components/sunburst';
import { ChartDescription } from './components/chart-description';
import { Table } from './components/table';
import { MigrationVelocityChart } from './components/migration-velocity-chart';
import { VersionAdoptionChart } from './components/version-adoption-chart';
import { VersionLifecycleChart } from './components/version-lifecycle-chart';
import {
  matchVersionFilter,
  VersionFilterBar,
} from './components/version-filter-bar';
import { usePackageData } from './hooks/use-package-data';
import { useAppStore } from './store';
import { findNodeByVersion } from './utils/chart-data';

export function PackageDashboard({ seed }: { seed: PackageDetailData }) {
  // Seed synchronously in a state initializer, before the `useAppStore`
  // selectors below run, so this render already sees the route's package and
  // tab rather than briefly showing the store's defaults.
  useState(() => {
    seedPackageStore(seed);
    return null;
  });

  // Re-seed when the route changes under a client-side navigation (tab switch
  // or a new package) — the initializer above only runs on mount.
  useEffect(() => {
    seedPackageStore(seed);
  }, [seed]);

  usePackageData();

  // Read state from the store
  const sortByVersion = useAppStore((s) => s.sortByVersion);
  const showDataTable = useAppStore((s) => s.showDataTable);
  const sunburstChartData = useAppStore((s) => s.sunburstChartData);
  const isLoading = useAppStore((s) => s.isLoading);
  const isLoadingHistory = useAppStore((s) => s.isLoadingHistory);
  const isRevalidating = useAppStore((s) => s.isRevalidating);
  const error = useAppStore((s) => s.error);
  const selectedVersion = useAppStore((s) => s.selectedVersion);
  const expandedNodes = useAppStore((s) => s.expandedNodes);
  const snapshots = useAppStore((s) => s.snapshots);
  const snapshotIndex = useAppStore((s) => s.snapshotIndex);
  const versionReleases = useAppStore((s) => s.versionReleases);
  const viewMode = useAppStore((s) => s.viewMode);
  const liveData = useAppStore((s) => s.liveData);
  const totalDownloads = useAppStore((s) => s.totalDownloads);
  const health = useAppStore((s) => s.health);
  const lowPassFilter = useAppStore((s) => s.lowPassFilter);
  const versionFilter = useAppStore((s) => s.versionFilter);
  const setVersionFilter = useAppStore((s) => s.setVersionFilter);

  const handleVersionClick = useAppStore((s) => s.handleVersionClick);
  const resetSelection = useAppStore((s) => s.resetSelection);
  const previousSnapshot = useAppStore((s) => s.previousSnapshot);
  const nextSnapshot = useAppStore((s) => s.nextSnapshot);
  const goLive = useAppStore((s) => s.goLive);
  const selectSnapshotDate = useAppStore((s) => s.selectSnapshotDate);
  const invalidateCache = useAppStore((s) => s.invalidateCache);

  const selectedNode = useMemo<SunburstData | SunburstLeafNode | null>(
    () => findNodeByVersion(sunburstChartData, selectedVersion || null),
    [sunburstChartData, selectedVersion]
  );

  const sunburstSourceVersions = useMemo<string[]>(() => {
    const downloads =
      snapshotIndex !== null && snapshots[snapshotIndex]
        ? snapshots[snapshotIndex].downloads
        : liveData?.downloads ?? null;
    if (!downloads) return [];
    return Object.keys(downloads).map((v) => `v${v}`);
  }, [snapshots, snapshotIndex, liveData]);

  const sunburstFilterMatch = useMemo(
    () => matchVersionFilter(sunburstSourceVersions, versionFilter),
    [sunburstSourceVersions, versionFilter]
  );

  return (
    <Card>
      <DashboardHeader />

      {/* The health report can paint from the server-inlined copy while the
          rest of the package loads, so it skips the skeleton. */}
      {isLoading && !(viewMode === 'health' && health) ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorMessage message={error} onRetry={invalidateCache} />
      ) : (
        <div className="container-with-table">
          {isLoadingHistory && viewMode !== 'health' ? (
            <div className={styles.historyPill} role="status">
              <span className={styles.historySpinner} aria-hidden="true" />
              Loading snapshot history…
              {snapshots.length > 1 ? ` (${snapshots.length} loaded)` : null}
            </div>
          ) : isRevalidating && viewMode !== 'health' ? (
            <div className={styles.historyPill} role="status">
              <span className={styles.historySpinner} aria-hidden="true" />
              Checking for updates…
            </div>
          ) : null}

          {viewMode === 'sunburst' && snapshots.length > 0 && (
            <SnapshotControls
              currentIndex={snapshotIndex ?? snapshots.length}
              totalSnapshots={snapshots.length}
              currentDate={
                snapshotIndex !== null ? snapshots[snapshotIndex].date : null
              }
              snapshotDates={snapshots.map((s) => s.date)}
              versionReleases={versionReleases}
              onPrevious={previousSnapshot}
              onNext={nextSnapshot}
              onLive={goLive}
              onSelectDate={selectSnapshotDate}
            />
          )}

          {viewMode === 'sunburst' ? (
            <>
              {sunburstSourceVersions.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    margin: 'var(--spacing-sm) 0 var(--spacing-md)',
                  }}
                >
                  <VersionFilterBar
                    value={versionFilter}
                    onChange={setVersionFilter}
                    totalCount={sunburstSourceVersions.length}
                    matchingCount={sunburstFilterMatch.matchingLabels.size}
                    isRangeActive={sunburstFilterMatch.isRangeActive}
                  />
                </div>
              ) : null}
              {sunburstChartData ? (
                <Sunburst
                  data={sunburstChartData}
                  sortByVersion={sortByVersion}
                  onVersionChange={handleVersionClick}
                  selectedVersion={selectedVersion}
                />
              ) : null}

              {(selectedVersion !== null || expandedNodes.length > 0) && (
                <button className={styles.clearButton} onClick={resetSelection}>
                  ↺ Reset Selection
                </button>
              )}
              {selectedNode && showDataTable ? (
                <Table
                  data={selectedNode}
                  onVersionClick={handleVersionClick}
                />
              ) : null}
              <ChartDescription>
                <p>Hierarchical breakdown of downloads by version.</p>
                <ul>
                  <li>Each ring = major → minor → patch</li>
                  <li>Click to zoom in, center to zoom out</li>
                  {lowPassFilter > 0 && (
                    <li>
                      Below {(lowPassFilter * 100).toFixed(1)}% grouped as
                      &ldquo;Other&rdquo;
                    </li>
                  )}
                  <li>
                    {sortByVersion
                      ? 'Sorted by version'
                      : 'Sorted by downloads'}
                  </li>
                </ul>
              </ChartDescription>
            </>
          ) : viewMode === 'adoption' ? (
            <VersionAdoptionChart
              snapshots={snapshots}
              liveData={liveData}
              versionReleases={versionReleases}
              lowPassFilter={lowPassFilter}
              totalDownloads={totalDownloads}
            />
          ) : viewMode === 'migration' ? (
            <MigrationVelocityChart
              snapshots={snapshots}
              liveData={liveData}
              versionReleases={versionReleases}
            />
          ) : viewMode === 'lifecycle' ? (
            <VersionLifecycleChart
              snapshots={snapshots}
              liveData={liveData}
              versionReleases={versionReleases}
            />
          ) : viewMode === 'health' ? (
            <HealthReport health={health} />
          ) : null}
        </div>
      )}
    </Card>
  );
}
