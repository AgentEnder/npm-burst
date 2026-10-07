import { memo, useCallback, useMemo } from 'react';
import { areaY, defineChart, lineY } from '@tanstack/charts';
import { crosshair } from '@tanstack/charts/crosshair';
import { Chart } from '@tanstack/charts/react';
import { tooltip } from '@tanstack/charts/tooltip';
import { scaleLinear, scaleTime } from 'd3-scale';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';
import type { DailyDownloadPoint } from '../../server/functions/total-downloads.telefunc';
import { useTheme } from '../context/theme-context';
import { useHiddenSeries } from '../hooks/use-hidden-series';
import { useAppStore } from '../store';
import {
  buildColorMap,
  generateThemeColorPalette,
} from '../utils/theme-colors';
import {
  formatDay,
  formatDownloadCount,
  monotoneCurve,
  parseDay,
} from '../utils/chart-kit';
import {
  AdoptionGrouping,
  getVersionAdoptionData,
} from '../utils/version-adoption';
import {
  filterReleasesByLevel,
  releaseTickMarks,
  RELEASE_TICK_OPTIONS,
} from '../utils/release-ticks';
import type { ReleaseTickLevel } from '../utils/release-ticks';
import { getTimeWindowCutoff, TIME_WINDOW_OPTIONS } from '../utils/time-window';
import { ChartDescription } from './chart-description';
import { SegmentedControl } from './segmented-control';
import { matchVersionFilter, VersionFilterBar } from './version-filter-bar';
import styles from './version-adoption-chart.module.scss';

const CHART_HEIGHT = 350;

const GROUPING_OPTIONS = [
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'patch', label: 'Patch' },
] as const;

const Y_AXIS_OPTIONS = [
  { value: 'percent', label: '% Share' },
  { value: 'count', label: 'Downloads' },
] as const;

type YAxisMode = 'percent' | 'count';

const CHART_MODE_OPTIONS = [
  { value: 'stacked', label: 'Stacked' },
  { value: 'lines', label: 'Lines' },
] as const;

type ChartMode = 'stacked' | 'lines';

interface AdoptionRow {
  label: string;
  day: string;
  date: Date;
  /** Plotted value: percent share or download count. */
  value: number;
  count: number;
}

export const VersionAdoptionChart = memo(function VersionAdoptionChart({
  snapshots,
  liveData,
  versionReleases,
  lowPassFilter,
  totalDownloads,
}: {
  snapshots: Snapshot[];
  liveData: NpmDownloadsByVersion | null;
  versionReleases: VersionRelease[];
  lowPassFilter: number;
  totalDownloads: DailyDownloadPoint[];
}) {
  const { theme } = useTheme();
  const [hiddenSeries, setHiddenSeries] = useHiddenSeries('adoptionHidden');
  const versionFilter = useAppStore((s) => s.versionFilter);
  const setVersionFilter = useAppStore((s) => s.setVersionFilter);
  const timeWindow = useAppStore((s) => s.timeWindow);
  const onTimeWindowChange = useAppStore((s) => s.setTimeWindow);
  const grouping = useAppStore((s) => s.adoptionGrouping);
  const setGrouping = useAppStore((s) => s.setAdoptionGrouping);
  const yAxisMode = useAppStore((s) => s.adoptionYAxis);
  const setYAxisMode = useAppStore((s) => s.setAdoptionYAxis);
  const chartMode = useAppStore((s) => s.adoptionChartMode);
  const setChartMode = useAppStore((s) => s.setAdoptionChartMode);
  const showReleaseTicks = useAppStore((s) => s.adoptionShowReleases);
  const setShowReleaseTicks = useAppStore((s) => s.setAdoptionShowReleases);
  const releaseTickLevel = useAppStore((s) => s.adoptionTickLevel);
  const setReleaseTickLevel = useAppStore((s) => s.setAdoptionTickLevel);

  const effectiveTickLevel: ReleaseTickLevel = releaseTickLevel ?? grouping;

  const timeWindowCutoff = useMemo(
    () => getTimeWindowCutoff(timeWindow),
    [timeWindow]
  );

  const filteredSnapshots = useMemo(() => {
    if (!timeWindowCutoff) return snapshots;
    const cutoffStr = timeWindowCutoff.toISOString().slice(0, 10);
    const inWindow = snapshots.filter((s) => s.date >= cutoffStr);
    // When the cutoff falls between snapshots, create a synthetic snapshot
    // at the cutoff date using the last pre-cutoff snapshot's data. This
    // anchors the chart at real version percentages instead of 100% unknown,
    // without extending the X-axis beyond the window.
    const preCutoff = snapshots.filter((s) => s.date < cutoffStr);
    if (
      preCutoff.length > 0 &&
      (inWindow.length === 0 || inWindow[0].date > cutoffStr)
    ) {
      const anchor = preCutoff[preCutoff.length - 1];
      return [{ ...anchor, date: cutoffStr }, ...inWindow];
    }
    return inWindow;
  }, [snapshots, timeWindowCutoff]);

  const filteredTotalDownloads = useMemo(() => {
    if (!timeWindowCutoff) return totalDownloads;
    const cutoffStr = timeWindowCutoff.toISOString().slice(0, 10);
    return totalDownloads.filter((d) => d.day >= cutoffStr);
  }, [totalDownloads, timeWindowCutoff]);

  const series = useMemo(
    () =>
      getVersionAdoptionData(
        filteredSnapshots,
        liveData,
        grouping,
        lowPassFilter,
        filteredTotalDownloads
      ),
    [
      filteredSnapshots,
      liveData,
      grouping,
      lowPassFilter,
      filteredTotalDownloads,
    ]
  );

  const toggleSeries = useCallback(
    (label: string) => {
      setHiddenSeries((prev) => {
        const next = new Set(prev);
        if (next.has(label)) {
          next.delete(label);
        } else {
          next.add(label);
        }
        return next;
      });
    },
    [setHiddenSeries]
  );

  const showAll = useCallback(
    () => setHiddenSeries(new Set()),
    [setHiddenSeries]
  );

  const showOnlyAboveThreshold = useCallback(() => {
    setHiddenSeries(
      new Set(series.filter((s) => s.belowThreshold).map((s) => s.label))
    );
  }, [series, setHiddenSeries]);

  // Exclude series that are always zero (no meaningful data points)
  const nonZeroSeries = useMemo(
    () =>
      series.filter((s) => s.points.some((p) => p.percent > 0 || p.count > 0)),
    [series]
  );

  const nonZeroLabels = useMemo(
    () => nonZeroSeries.map((s) => s.label),
    [nonZeroSeries]
  );
  const filterMatch = useMemo(
    () => matchVersionFilter(nonZeroLabels, versionFilter),
    [nonZeroLabels, versionFilter]
  );

  const effectiveHidden = useMemo(() => {
    if (!filterMatch.isRangeActive) return hiddenSeries;
    const next = new Set(hiddenSeries);
    for (const label of nonZeroLabels) {
      if (!filterMatch.matchingLabels.has(label)) next.add(label);
    }
    return next;
  }, [hiddenSeries, filterMatch, nonZeroLabels]);

  const visibleSeries = useMemo(
    () => nonZeroSeries.filter((s) => !effectiveHidden.has(s.label)),
    [nonZeroSeries, effectiveHidden]
  );

  const filteredLegendSeries = useMemo(
    () => nonZeroSeries.filter((s) => filterMatch.matchingLabels.has(s.label)),
    [nonZeroSeries, filterMatch]
  );

  const showMatching = useCallback(() => {
    if (filteredLegendSeries.length === 0) return;
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      for (const s of filteredLegendSeries) next.delete(s.label);
      return next;
    });
  }, [filteredLegendSeries, setHiddenSeries]);

  const hideMatching = useCallback(() => {
    if (filteredLegendSeries.length === 0) return;
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      for (const s of filteredLegendSeries) next.add(s.label);
      return next;
    });
  }, [filteredLegendSeries, setHiddenSeries]);

  const palette = useMemo(
    () => generateThemeColorPalette(series.length + 1, theme),
    [series.length, theme]
  );
  const colorMap = useMemo(
    () =>
      buildColorMap(
        series.map((s) => s.label),
        palette
      ),
    [series, palette]
  );

  const definition = useMemo(() => {
    const valueKey = yAxisMode === 'percent' ? 'percent' : 'count';
    const colorOf = (row: AdoptionRow) => colorMap.get(row.label) ?? '#888';

    // Newest version is first in `visibleSeries`; stack it on top.
    const stackSeries =
      chartMode === 'stacked' ? visibleSeries.slice().reverse() : visibleSeries;
    const rows: AdoptionRow[] = stackSeries.flatMap((s) =>
      s.points.map((p) => ({
        label: s.label,
        day: p.date,
        date: parseDay(p.date),
        value: p[valueKey],
        count: p.count,
      }))
    );

    const days = Array.from(
      new Set(series.flatMap((s) => s.points.map((p) => p.date)))
    ).sort();
    const domain: [Date, Date] = [
      parseDay(days[0] ?? '1970-01-01'),
      parseDay(days[days.length - 1] ?? '1970-01-01'),
    ];

    let yMax = 100;
    if (yAxisMode === 'count') {
      const totals = new Map<string, number>();
      for (const row of rows) {
        totals.set(row.day, (totals.get(row.day) ?? 0) + row.count);
      }
      yMax = Math.max(0, ...totals.values()) * 1.1 || 1;
    }

    const formatValue = (value: number) =>
      yAxisMode === 'percent'
        ? `${value.toFixed(1)}%`
        : formatDownloadCount(value);

    return defineChart({
      marks: [
        chartMode === 'stacked'
          ? areaY(rows, {
              id: 'adoption',
              x: 'date',
              y: 'value',
              z: 'label',
              key: (row) => `${row.label}@${row.day}`,
              fill: colorOf,
              fillOpacity: 0.7,
              stroke: colorOf,
              strokeWidth: 0.5,
              curve: monotoneCurve,
            })
          : lineY(rows, {
              id: 'adoption',
              x: 'date',
              y: 'value',
              z: 'label',
              key: (row) => `${row.label}@${row.day}`,
              stroke: colorOf,
              strokeWidth: 2,
              points: true,
              curve: monotoneCurve,
            }),
        ...(showReleaseTicks && days.length >= 2
          ? releaseTickMarks(
              filterReleasesByLevel(versionReleases, effectiveTickLevel),
              domain,
              yMax
            )
          : []),
        crosshair({ x: true, y: false }),
      ],
      scales: {
        x: {
          scale: scaleTime().domain(domain),
          axis: {
            ticks: { count: 8, format: formatDay },
            tickLabels: { rotate: -25, anchor: 'end' },
          },
        },
        y: {
          scale: scaleLinear().domain([0, yMax]),
          grid: { strokeOpacity: 0.3 },
          axis: {
            ticks: {
              count: 5,
              format: (v: number) =>
                yAxisMode === 'percent' ? `${v}%` : formatDownloadCount(v),
            },
          },
        },
      },
      margin: { top: 20, right: 20 },
      focus: 'group-x',
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: {
        use: tooltip,
        content: (points) => {
          const entries = points
            .filter((p) => p.datum.value > 0)
            .sort((a, b) => b.datum.value - a.datum.value);
          const total = entries.reduce((sum, p) => sum + p.datum.count, 0);
          return {
            title: points[0]?.datum.day,
            rows: [
              ...entries.map((p) => ({
                label: p.datum.label,
                value: formatValue(p.datum.value),
                color: colorOf(p.datum),
              })),
              ...(yAxisMode === 'count'
                ? [{ label: 'Total', value: formatDownloadCount(total) }]
                : []),
            ],
          };
        },
      },
    });
  }, [
    series,
    visibleSeries,
    versionReleases,
    effectiveTickLevel,
    showReleaseTicks,
    yAxisMode,
    chartMode,
    colorMap,
  ]);

  const hasHidden = hiddenSeries.size > 0;
  const hasBelowThreshold = nonZeroSeries.some((s) => s.belowThreshold);

  return (
    <div className={styles.container}>
      {/* Controls — always visible so users can change filters */}
      <div className={styles.controls}>
        <SegmentedControl
          options={CHART_MODE_OPTIONS}
          value={chartMode}
          onChange={(v) => setChartMode(v as ChartMode)}
        />
        <SegmentedControl
          options={Y_AXIS_OPTIONS}
          value={yAxisMode}
          onChange={(v) => setYAxisMode(v as YAxisMode)}
        />
        <SegmentedControl
          options={GROUPING_OPTIONS}
          value={grouping}
          onChange={(v) => setGrouping(v as AdoptionGrouping)}
          label="Group by"
        />
        <SegmentedControl
          options={TIME_WINDOW_OPTIONS}
          value={timeWindow}
          onChange={onTimeWindowChange}
          label="Window"
        />
        <div className={styles.releaseTickControl}>
          <label className={styles.tickCheckbox}>
            <input
              type="checkbox"
              checked={showReleaseTicks}
              onChange={(e) => setShowReleaseTicks(e.target.checked)}
            />
            Releases
          </label>
          {showReleaseTicks && (
            <SegmentedControl
              options={RELEASE_TICK_OPTIONS}
              value={effectiveTickLevel}
              onChange={(v) => setReleaseTickLevel(v as ReleaseTickLevel)}
            />
          )}
        </div>
        <div className={styles.visibilityControls}>
          {hasHidden && (
            <button className={styles.visibilityButton} onClick={showAll}>
              Show all
            </button>
          )}
          {hasBelowThreshold && !hasHidden && (
            <button
              className={styles.visibilityButton}
              onClick={showOnlyAboveThreshold}
            >
              Hide below LPF
            </button>
          )}
        </div>
        {nonZeroSeries.length > 0 ? (
          <VersionFilterBar
            value={versionFilter}
            onChange={setVersionFilter}
            totalCount={nonZeroSeries.length}
            matchingCount={filterMatch.matchingLabels.size}
            isRangeActive={filterMatch.isRangeActive}
            onShowMatching={showMatching}
            onHideMatching={hideMatching}
          />
        ) : null}
      </div>

      {series.length === 0 ? (
        <div className={styles.noData}>
          No historical snapshot data available. Track this package to start
          collecting adoption data over time.
        </div>
      ) : (
        <>
          <Chart
            className={styles.chart}
            definition={definition}
            height={CHART_HEIGHT}
            initialWidth={900}
            ariaLabel="Version adoption over time"
          />

          {/* Legend with click-to-toggle */}
          <div className={styles.legend}>
            {filteredLegendSeries.length === 0 ? (
              <span className={styles.legendEmpty}>
                No versions match &ldquo;{versionFilter}&rdquo;
              </span>
            ) : (
              filteredLegendSeries.map((s) => {
                const isHidden = hiddenSeries.has(s.label);
                const color =
                  colorMap.get(s.label) ?? (isHidden ? 'transparent' : '#888');
                const isBelowLPF = s.belowThreshold;
                return (
                  <div
                    key={s.label}
                    className={`${styles.legendItem} ${
                      isHidden ? styles.legendItemDimmed : ''
                    } ${
                      isBelowLPF && !isHidden ? styles.legendItemBelowLPF : ''
                    }`}
                    onClick={() => toggleSeries(s.label)}
                    title={
                      isBelowLPF
                        ? `Below LPF threshold (${(lowPassFilter * 100).toFixed(
                            1
                          )}%)`
                        : `Click to ${isHidden ? 'show' : 'hide'}`
                    }
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
          {chartMode === 'stacked'
            ? `Stacked area — ${grouping} version share over time.`
            : `Line chart — ${grouping} version trends over time.`}
        </p>
        <ul>
          <li>
            Y-axis: {yAxisMode === 'percent' ? '% share' : 'download count'}
          </li>
          {lowPassFilter > 0 && (
            <li>Below {(lowPassFilter * 100).toFixed(1)}% dimmed in legend</li>
          )}
          <li>Click legend to toggle series</li>
        </ul>
      </ChartDescription>
    </div>
  );
});
