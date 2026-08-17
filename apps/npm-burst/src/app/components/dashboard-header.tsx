import { Info } from 'lucide-react';
import { memo } from 'react';
import { useAppStore } from '../store';
import styles from './dashboard-header.module.scss';
import { HealthRefreshControl } from './health-refresh-control';
import { PackageTabs, PackageTitle } from './package-tabs';
import { Popover } from './popover';
import { TrackStar } from './track-star';

export const DashboardHeader = memo(function DashboardHeader() {
  const npmPackageName = useAppStore((s) => s.npmPackageName);
  const sortByVersion = useAppStore((s) => s.sortByVersion);
  const showDataTable = useAppStore((s) => s.showDataTable);
  const lowPassFilter = useAppStore((s) => s.lowPassFilter);
  const viewMode = useAppStore((s) => s.viewMode);
  const setSortByVersion = useAppStore((s) => s.setSortByVersion);
  const setShowDataTable = useAppStore((s) => s.setShowDataTable);
  const setLowPassFilter = useAppStore((s) => s.setLowPassFilter);

  return (
    <div className={styles.wrapper}>
      {/* Package title row */}
      <div className={styles.titleRow}>
        <PackageTitle packageName={npmPackageName} />
        <TrackStar packageName={npmPackageName} />
      </div>

      {/* Controls bar */}
      <div className={styles.header}>
        {/* Tabs are links so they stay shareable and crawlable */}
        <PackageTabs packageName={npmPackageName} activeTab={viewMode} />

        {/* Per-tab controls live in this strip; health's is the refresh. */}
        {viewMode === 'health' && (
          <>
            <div className={styles.spacer} />
            <HealthRefreshControl />
          </>
        )}

        {viewMode === 'sunburst' && (
          <>
            {/* Divider */}
            <div className={styles.divider} />

            {/* Toggle controls */}
            <div className={styles.toggleGroup}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={sortByVersion}
                  onChange={() => setSortByVersion(!sortByVersion)}
                  className={styles.toggleInput}
                />
                <span className={styles.toggleTrack}>
                  <span className={styles.toggleThumb} />
                </span>
                <span className={styles.toggleLabel}>Sort by version</span>
              </label>

              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={showDataTable}
                  onChange={() => setShowDataTable(!showDataTable)}
                  className={styles.toggleInput}
                />
                <span className={styles.toggleTrack}>
                  <span className={styles.toggleThumb} />
                </span>
                <span className={styles.toggleLabel}>Show table</span>
              </label>
            </div>
          </>
        )}

        {(viewMode === 'sunburst' || viewMode === 'adoption') && (
          <>
            {/* Divider */}
            <div className={styles.divider} />

            {/* Low pass filter */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>
                LPF
                <Popover
                  content={
                    <div className={styles.popoverContent}>
                      <strong>Low Pass Filter</strong>
                      <p>
                        {viewMode === 'sunburst'
                          ? 'Versions with fewer than this percentage of downloads are aggregated into summary nodes. Click aggregated nodes to expand.'
                          : 'Version groups with a smaller average share of downloads are dimmed in the legend. Use "Hide below LPF" to remove them from the chart.'}
                      </p>
                    </div>
                  }
                >
                  <Info size={14} className={styles.infoIcon} />
                </Popover>
              </label>
              <div className={styles.filterInput}>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={100}
                  value={lowPassFilter * 100}
                  onChange={(e) => {
                    const val = e.target.valueAsNumber;
                    if (!Number.isNaN(val)) setLowPassFilter(val / 100);
                  }}
                  className={styles.numberInput}
                />
                <span className={styles.filterSuffix}>%</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
