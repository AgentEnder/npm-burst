import { memo, useCallback, useMemo, useState } from 'react';
import { defineChart, lineY } from '@tanstack/charts';
import type { ChartFocusStrategy, ChartPoint } from '@tanstack/charts';
import { crosshair } from '@tanstack/charts/crosshair';
import { focusNearestX } from '@tanstack/charts/focus';
import { Chart } from '@tanstack/charts/react';
import { tooltip } from '@tanstack/charts/tooltip';
import { scaleLinear } from 'd3-scale';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';
import { useTheme } from '../context/theme-context';
import {
  buildColorMap,
  generateThemeColorPalette,
} from '../utils/theme-colors';
import { monotoneCurve } from '../utils/chart-kit';
import { getMigrationVelocityData } from '../utils/migration-velocity';
import {
  getMigrationMaxDays,
  MIGRATION_GRANULARITY_OPTIONS,
  MIGRATION_WINDOW_OPTIONS,
} from '../utils/time-window';
import type {
  MigrationGranularity,
  MigrationTimeWindow,
} from '../utils/time-window';
import { ChartDescription } from './chart-description';
import { SegmentedControl } from './segmented-control';
import { matchVersionFilter, VersionFilterBar } from './version-filter-bar';
import styles from './migration-velocity-chart.module.scss';

const CHART_HEIGHT = 350;

/** Series whose nearest point is within this many days join the tooltip. */
const TOOLTIP_DAY_TOLERANCE = 3;

interface VelocityRow {
  label: string;
  days: number;
  percent: number;
}

type VelocityPoint = ChartPoint<VelocityRow, number, number>;

/**
 * Groups each series' nearest point to the focused day, keeping those within
 * `TOOLTIP_DAY_TOLERANCE`. Series rarely share exact day values, so the
 * built-in `group-x` would usually show a single row.
 */
export function groupWithinDays(
  points: readonly VelocityPoint[],
  focused: VelocityPoint
): VelocityPoint[] {
  const day = focused.datum.days;
  const nearest = new Map<string, VelocityPoint>();
  for (const point of points) {
    const { label, days } = point.datum;
    const dist = Math.abs(days - day);
    if (dist > TOOLTIP_DAY_TOLERANCE) continue;
    const current = nearest.get(label);
    if (!current || dist < Math.abs(current.datum.days - day)) {
      nearest.set(label, point);
    }
  }
  nearest.set(focused.datum.label, focused);
  return [
    focused,
    ...[...nearest.values()].filter((point) => point !== focused),
  ];
}

const focusWithinDays: ChartFocusStrategy<VelocityRow, number, number> = {
  resolve: (points, context) => {
    const [primary] = focusNearestX.resolve(points, context);
    return primary ? groupWithinDays(points, primary) : [];
  },
  group: (points, { point }) => groupWithinDays(points, point),
  navigation: (points) => focusNearestX.navigation(points),
};

export const MigrationVelocityChart = memo(function MigrationVelocityChart({
  snapshots,
  liveData,
  versionReleases,
  migrationTimeWindow,
  onMigrationTimeWindowChange,
  migrationGranularity,
  onMigrationGranularityChange,
}: {
  snapshots: Snapshot[];
  liveData: NpmDownloadsByVersion | null;
  versionReleases: VersionRelease[];
  migrationTimeWindow: MigrationTimeWindow;
  onMigrationTimeWindowChange: (v: MigrationTimeWindow) => void;
  migrationGranularity: MigrationGranularity;
  onMigrationGranularityChange: (v: MigrationGranularity) => void;
}) {
  const { theme } = useTheme();
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [legendFilter, setLegendFilter] = useState('');

  const series = useMemo(
    () =>
      getMigrationVelocityData(
        snapshots,
        liveData,
        versionReleases,
        migrationGranularity
      ),
    [snapshots, liveData, versionReleases, migrationGranularity]
  );

  const toggleSeries = useCallback((label: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  const allLabels = useMemo(() => series.map((s) => s.label), [series]);
  const filterMatch = useMemo(
    () => matchVersionFilter(allLabels, legendFilter),
    [allLabels, legendFilter]
  );

  const effectiveHidden = useMemo(() => {
    if (!filterMatch.isRangeActive) return hiddenSeries;
    const next = new Set(hiddenSeries);
    for (const label of allLabels) {
      if (!filterMatch.matchingLabels.has(label)) next.add(label);
    }
    return next;
  }, [hiddenSeries, filterMatch, allLabels]);

  const visibleSeries = useMemo(
    () => series.filter((s) => !effectiveHidden.has(s.label)),
    [series, effectiveHidden]
  );

  const plottableSeriesCount = useMemo(() => {
    const windowMaxDays = getMigrationMaxDays(migrationTimeWindow);
    if (windowMaxDays === null) return series.length;
    return series.filter((s) =>
      s.points.some((p) => p.daysSinceRelease <= windowMaxDays)
    ).length;
  }, [series, migrationTimeWindow]);

  const filteredLegendSeries = useMemo(
    () => series.filter((s) => filterMatch.matchingLabels.has(s.label)),
    [series, filterMatch]
  );

  const showAllInFilter = useCallback(() => {
    if (filteredLegendSeries.length === 0) return;
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      for (const s of filteredLegendSeries) next.delete(s.label);
      return next;
    });
  }, [filteredLegendSeries]);

  const hideAllInFilter = useCallback(() => {
    if (filteredLegendSeries.length === 0) return;
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      for (const s of filteredLegendSeries) next.add(s.label);
      return next;
    });
  }, [filteredLegendSeries]);

  const palette = useMemo(
    () => generateThemeColorPalette(series.length, theme),
    [series.length, theme]
  );
  const colorMap = useMemo(
    () => buildColorMap(allLabels, palette),
    [allLabels, palette]
  );

  const definition = useMemo(() => {
    const colorOf = (row: VelocityRow) => colorMap.get(row.label) ?? '#888';
    const windowMaxDays = getMigrationMaxDays(migrationTimeWindow);

    const rows: VelocityRow[] = visibleSeries.flatMap((s) =>
      s.points
        .filter(
          (p) => windowMaxDays === null || p.daysSinceRelease <= windowMaxDays
        )
        .map((p) => ({
          label: s.label,
          days: p.daysSinceRelease,
          percent: p.percent,
        }))
    );

    let maxDays = 30;
    if (visibleSeries.length > 0) {
      maxDays = Math.max(
        ...visibleSeries.flatMap((s) => s.points.map((p) => p.daysSinceRelease))
      );
    }
    const effectiveMaxDays =
      windowMaxDays !== null ? Math.min(maxDays, windowMaxDays) : maxDays;

    return defineChart({
      marks: [
        lineY(rows, {
          id: 'velocity',
          x: 'days',
          y: 'percent',
          z: 'label',
          key: (row) => `${row.label}@${row.days}`,
          stroke: colorOf,
          strokeWidth: 2,
          points: true,
          curve: monotoneCurve,
        }),
        crosshair({ x: true, y: false }),
      ],
      scales: {
        x: {
          scale: scaleLinear().domain([0, effectiveMaxDays]),
          axis: {
            label: 'Days since release',
            ticks: { count: 8, format: (d: number) => `${d}d` },
          },
        },
        y: {
          scale: scaleLinear().domain([0, 100]),
          grid: { strokeOpacity: 0.3 },
          axis: {
            ticks: { count: 5, format: (v: number) => `${v}%` },
          },
        },
      },
      margin: { top: 20, right: 20 },
      focus: focusWithinDays,
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: {
        use: tooltip,
        content: (points) => ({
          title: `Day ${points[0]?.datum.days ?? 0}`,
          rows: points
            .slice()
            .sort((a, b) => b.datum.percent - a.datum.percent)
            .map((p) => ({
              label: p.datum.label,
              value: `${p.datum.percent.toFixed(1)}%`,
              color: colorOf(p.datum),
            })),
        }),
      },
    });
  }, [visibleSeries, colorMap, migrationTimeWindow]);

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <SegmentedControl
          options={MIGRATION_GRANULARITY_OPTIONS}
          value={migrationGranularity}
          onChange={onMigrationGranularityChange}
          label="Group by"
        />
        <SegmentedControl
          options={MIGRATION_WINDOW_OPTIONS}
          value={migrationTimeWindow}
          onChange={onMigrationTimeWindowChange}
          label="Window"
        />
        {series.length > 0 ? (
          <VersionFilterBar
            value={legendFilter}
            onChange={setLegendFilter}
            totalCount={series.length}
            matchingCount={filterMatch.matchingLabels.size}
            isRangeActive={filterMatch.isRangeActive}
            onShowMatching={showAllInFilter}
            onHideMatching={hideAllInFilter}
          />
        ) : null}
      </div>
      {series.length === 0 ? (
        <div className={styles.noData}>
          No historical snapshot data or version release information available.
          Track this package to start collecting migration velocity data.
        </div>
      ) : (
        <>
          {plottableSeriesCount === 0 ? (
            <div className={styles.noData}>
              No releases have data points within the selected{' '}
              <strong>{migrationTimeWindow}</strong> window. Every tracked{' '}
              {migrationGranularity} version&apos;s first snapshot lands after
              the cutoff. Try a wider window above to see them.
            </div>
          ) : (
            <Chart
              className={styles.chart}
              definition={definition}
              height={CHART_HEIGHT}
              initialWidth={900}
              ariaLabel="Migration velocity by version"
            />
          )}

          <div className={styles.legend}>
            {filteredLegendSeries.length === 0 ? (
              <span className={styles.legendEmpty}>
                No versions match &ldquo;{legendFilter}&rdquo;
              </span>
            ) : (
              filteredLegendSeries.map((s) => {
                const isHidden = hiddenSeries.has(s.label);
                const color = colorMap.get(s.label) ?? '#888';
                return (
                  <div
                    key={s.label}
                    className={`${styles.legendItem} ${
                      isHidden ? styles.legendItemDimmed : ''
                    }`}
                    onClick={() => toggleSeries(s.label)}
                    title={`Released ${s.releaseDate} · Click to ${
                      isHidden ? 'show' : 'hide'
                    }`}
                  >
                    <span
                      className={styles.legendSwatch}
                      style={{ backgroundColor: color }}
                    />
                    {s.label}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
      <ChartDescription>
        <p>
          Adoption speed per {migrationGranularity} version — steeper = faster
          uptake.
        </p>
        <ul>
          <li>X: days since release, Y: adoption %</li>
          <li>
            {migrationTimeWindow !== 'all'
              ? `Showing first ${migrationTimeWindow} after each release`
              : 'Showing full history'}
          </li>
          <li>Click a legend entry to toggle a version</li>
        </ul>
      </ChartDescription>
    </div>
  );
});
