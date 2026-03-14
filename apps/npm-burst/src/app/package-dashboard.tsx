import { useEffect, useMemo } from 'react';
import { Card } from './components/card';
import { DashboardHeader } from './components/dashboard-header';
import styles from './components/dashboard-header.module.scss';
import { ErrorMessage } from './components/error-message';
import { LoadingSkeleton } from './components/loading-skeleton';
import { SnapshotControls } from './components/snapshot-controls';
import {
  Sunburst,
  SunburstData,
  SunburstLeafNode,
} from './components/sunburst';
import { Table } from './components/table';
import { DownloadVolumeChart } from './components/download-volume-chart';
import { MigrationVelocityChart } from './components/migration-velocity-chart';
import { VersionAdoptionChart } from './components/version-adoption-chart';
import { VersionLifecycleChart } from './components/version-lifecycle-chart';
import { usePackageData } from './hooks/use-package-data';
import { appStore, useAppStore } from './store';
import { findNodeByVersion } from './utils/chart-data';

function parsePackageFromHash(): string {
  if (typeof window === 'undefined') return 'nx';
  const hash = window.location.hash; // e.g. "#/nx" or "#/nx?sortBy=version"
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const normalized = raw.startsWith('/') ? raw.slice(1) : raw;
  const qIdx = normalized.indexOf('?');
  const name = qIdx === -1 ? normalized : normalized.slice(0, qIdx);
  return decodeURIComponent(name) || 'nx';
}

export function PackageDashboard() {
  // Initialize package from hash on mount
  useEffect(() => {
    const pkg = parsePackageFromHash();
    const currentPkg = appStore.getState().npmPackageName;
    if (pkg !== currentPkg) {
      appStore.setState({
        npmPackageName: pkg,
        selectedVersion: null,
        expandedNodes: [],
        snapshotIndex: null,
      });
    }
  }, []);

  // Fetch data when package changes (hashchange is handled by url-sync.ts)
  usePackageData();

  // Read state from the store
  const sortByVersion = useAppStore((s) => s.sortByVersion);
  const showDataTable = useAppStore((s) => s.showDataTable);
  const sunburstChartData = useAppStore((s) => s.sunburstChartData);
  const isLoading = useAppStore((s) => s.isLoading);
  const error = useAppStore((s) => s.error);
  const selectedVersion = useAppStore((s) => s.selectedVersion);
  const expandedNodes = useAppStore((s) => s.expandedNodes);
  const snapshots = useAppStore((s) => s.snapshots);
  const snapshotIndex = useAppStore((s) => s.snapshotIndex);
  const versionReleases = useAppStore((s) => s.versionReleases);
  const viewMode = useAppStore((s) => s.viewMode);
  const liveData = useAppStore((s) => s.liveData);
  const lowPassFilter = useAppStore((s) => s.lowPassFilter);

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

  return (
    <Card>
      <DashboardHeader />

      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorMessage message={error} onRetry={invalidateCache} />
      ) : (
        <div className="container-with-table">
          {snapshots.length > 0 && (
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
              {sunburstChartData ? (
                <Sunburst
                  data={sunburstChartData}
                  sortByVersion={sortByVersion}
                  onVersionChange={handleVersionClick}
                  initialSelection={selectedVersion}
                />
              ) : null}

              {(selectedVersion !== null || expandedNodes.length > 0) && (
                <button
                  className={styles.clearButton}
                  onClick={resetSelection}
                >
                  ↺ Reset Selection
                </button>
              )}
              {selectedNode && showDataTable ? (
                <Table
                  data={selectedNode}
                  onVersionClick={handleVersionClick}
                />
              ) : null}
            </>
          ) : viewMode === 'adoption' ? (
            <VersionAdoptionChart
              snapshots={snapshots}
              liveData={liveData}
              versionReleases={versionReleases}
              lowPassFilter={lowPassFilter}
            />
          ) : viewMode === 'volume' ? (
            <DownloadVolumeChart
              snapshots={snapshots}
              liveData={liveData}
              versionReleases={versionReleases}
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
          ) : null}
        </div>
      )}
    </Card>
  );
}
