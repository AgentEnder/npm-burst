import * as d3 from 'd3';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';
import type { DailyDownloadPoint } from '../../server/functions/total-downloads.telefunc';
import { useTheme } from '../context/theme-context';
import {
  generateThemeColorPalette,
  getThemeChartColors,
} from '../utils/theme-colors';
import {
  AdoptionGrouping,
  getVersionAdoptionData,
} from '../utils/version-adoption';
import { formatDownloadCount } from '../utils/download-volume';
import { filterReleasesByLevel, renderReleaseTicks, RELEASE_TICK_OPTIONS } from '../utils/release-ticks';
import type { ReleaseTickLevel } from '../utils/release-ticks';
import { getTimeWindowCutoff, TIME_WINDOW_OPTIONS } from '../utils/time-window';
import type { TimeWindow } from '../utils/time-window';
import { SegmentedControl } from './segmented-control';
import styles from './version-adoption-chart.module.scss';

const MARGIN = { top: 20, right: 20, bottom: 60, left: 50 };
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

function buildColorMap(
  labels: string[],
  palette: string[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < labels.length; i++) {
    map.set(labels[i], palette[i % palette.length]);
  }
  return map;
}

export const VersionAdoptionChart = memo(function VersionAdoptionChart({
  snapshots,
  liveData,
  versionReleases,
  lowPassFilter,
  totalDownloads,
  timeWindow,
  onTimeWindowChange,
  releaseTickFilter,
  onReleaseTickFilterChange,
}: {
  snapshots: Snapshot[];
  liveData: NpmDownloadsByVersion | null;
  versionReleases: VersionRelease[];
  lowPassFilter: number;
  totalDownloads: DailyDownloadPoint[];
  timeWindow: TimeWindow;
  onTimeWindowChange: (v: TimeWindow) => void;
  releaseTickFilter: ReleaseTickLevel;
  onReleaseTickFilterChange: (v: ReleaseTickLevel) => void;
}) {
  const { theme } = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [grouping, setGrouping] = useState<AdoptionGrouping>('major');
  const [yAxisMode, setYAxisMode] = useState<YAxisMode>('percent');
  const [chartMode, setChartMode] = useState<ChartMode>('stacked');

  const filteredSnapshots = useMemo(() => {
    const cutoff = getTimeWindowCutoff(timeWindow);
    if (!cutoff) return snapshots;
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return snapshots.filter((s) => s.date >= cutoffStr);
  }, [snapshots, timeWindow]);

  const series = useMemo(
    () =>
      getVersionAdoptionData(
        filteredSnapshots,
        liveData,
        grouping,
        lowPassFilter,
        totalDownloads
      ),
    [filteredSnapshots, liveData, grouping, lowPassFilter, totalDownloads]
  );

  // Reset hidden series when grouping changes
  useEffect(() => {
    setHiddenSeries(new Set());
  }, [grouping]);

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

  const showAll = useCallback(() => setHiddenSeries(new Set()), []);

  const showOnlyAboveThreshold = useCallback(() => {
    setHiddenSeries(
      new Set(series.filter((s) => s.belowThreshold).map((s) => s.label))
    );
  }, [series]);

  const visibleSeries = useMemo(
    () => series.filter((s) => !hiddenSeries.has(s.label)),
    [series, hiddenSeries]
  );

  const chartColors = getThemeChartColors(theme);
  const palette = generateThemeColorPalette(series.length + 1, theme);
  const colorMap = useMemo(
    () => buildColorMap(series.map((s) => s.label), palette),
    [series, palette]
  );

  // D3 chart rendering
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || series.length === 0) return;

    const containerWidth = containerRef.current.clientWidth;
    const width = containerWidth;
    const height = CHART_HEIGHT;
    const innerWidth = width - MARGIN.left - MARGIN.right;
    const innerHeight = height - MARGIN.top - MARGIN.bottom;

    // Collect all dates
    const allDates = Array.from(
      new Set(series.flatMap((s) => s.points.map((p) => p.date)))
    ).sort();

    const xScale = d3
      .scalePoint<string>()
      .domain(allDates)
      .range([0, innerWidth])
      .padding(0.1);

    const valueKey = yAxisMode === 'percent' ? 'percent' : 'count';
    const maxCount = yAxisMode === 'count'
      ? d3.max(allDates, (date) => {
          let sum = 0;
          for (const s of visibleSeries) {
            const pt = s.points.find((p) => p.date === date);
            sum += pt?.count ?? 0;
          }
          return sum;
        }) ?? 0
      : 100;
    const yScale = d3.scaleLinear().domain([0, maxCount * (yAxisMode === 'count' ? 1.1 : 1)]).range([innerHeight, 0]);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width);

    const g = svg
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      );

    // X axis
    const tickInterval = Math.max(1, Math.floor(allDates.length / 8));
    const tickValues = allDates.filter((_, i) => i % tickInterval === 0);
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickValues(tickValues)
          .tickFormat((d) => {
            const date = new Date(d + 'T00:00:00');
            return d3.timeFormat('%b %d, %Y')(date);
          })
      )
      .selectAll('text')
      .attr('transform', 'rotate(-25)')
      .style('text-anchor', 'end');

    // Y axis
    g.append('g')
      .attr('class', 'axis')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((d) =>
            yAxisMode === 'percent' ? `${d}%` : formatDownloadCount(d as number)
          )
      );

    if (chartMode === 'stacked') {
      // Stacked area chart — most recent version on top
      const stackSeries = visibleSeries.slice().reverse();

      const tableData = allDates.map((date) => {
        const row: Record<string, number> = {};
        for (const s of stackSeries) {
          const pt = s.points.find((p) => p.date === date);
          row[s.label] = pt?.[valueKey] ?? 0;
        }
        return { date, ...row };
      });

      const keys = stackSeries.map((s) => s.label);
      const stack = d3.stack<Record<string, unknown>>().keys(keys).order(d3.stackOrderNone).offset(d3.stackOffsetNone);
      const stacked = stack(tableData as unknown as Array<Record<string, unknown>>);

      const areaGen = d3
        .area<d3.SeriesPoint<Record<string, unknown>>>()
        .x((d) => xScale((d.data as Record<string, string>).date) ?? 0)
        .y0((d) => yScale(d[0]))
        .y1((d) => yScale(d[1]))
        .curve(d3.curveMonotoneX);

      for (const layer of stacked) {
        const color = colorMap.get(layer.key) ?? '#888';
        g.append('path')
          .datum(layer)
          .attr('fill', color)
          .attr('fill-opacity', 0.7)
          .attr('stroke', color)
          .attr('stroke-width', 0.5)
          .attr('d', areaGen);
      }
    } else {
      // Line chart mode
      const lineGen = d3
        .line<{ date: string; percent: number; count: number }>()
        .x((d) => xScale(d.date) ?? 0)
        .y((d) => yScale(d[valueKey]))
        .curve(d3.curveMonotoneX);

      for (const s of visibleSeries) {
        const color = colorMap.get(s.label) ?? '#888';

        g.append('path')
          .datum(s.points)
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', 2)
          .attr('d', lineGen);

        g.selectAll(null)
          .data(s.points)
          .join('circle')
          .attr('cx', (d) => xScale(d.date) ?? 0)
          .attr('cy', (d) => yScale(d[valueKey]))
          .attr('r', 3)
          .attr('fill', color)
          .attr('stroke', theme === 'dark' ? '#1e1e1e' : '#ffffff')
          .attr('stroke-width', 1.5);
      }
    }

    // Version release markers (vertical ticks)
    if (allDates.length >= 2) {
      const firstDate = new Date(allDates[0] + 'T00:00:00');
      const lastDate = new Date(allDates[allDates.length - 1] + 'T00:00:00');
      const timeScale = d3
        .scaleTime()
        .domain([firstDate, lastDate])
        .range([xScale(allDates[0]) ?? 0, xScale(allDates[allDates.length - 1]) ?? innerWidth]);

      const filtered = filterReleasesByLevel(versionReleases, releaseTickFilter);
      renderReleaseTicks(
        g as unknown as d3.Selection<SVGGElement, unknown, null, undefined>,
        filtered,
        (date) => {
          const vrDate = new Date(date + 'T00:00:00');
          if (vrDate < firstDate || vrDate > lastDate) return null;
          return timeScale(vrDate);
        },
        innerHeight,
        theme
      );
    }

    // Tooltip
    const tooltip = d3
      .select(containerRef.current)
      .selectAll<HTMLDivElement, unknown>('.adoption-tooltip')
      .data([null])
      .join('div')
      .attr('class', 'adoption-tooltip')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('background', chartColors.tooltipBg)
      .style('border', `1px solid ${chartColors.tooltipBorder}`)
      .style('border-radius', '6px')
      .style('padding', '8px 12px')
      .style('font-size', '12px')
      .style('color', chartColors.tooltipText)
      .style('box-shadow', '0 2px 8px rgba(0,0,0,0.15)')
      .style('opacity', 0)
      .style('z-index', 10);

    // Invisible overlay for mouse tracking
    g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .on('mousemove', (event: MouseEvent) => {
        const [mx] = d3.pointer(event);
        let closestDate = allDates[0];
        let closestDist = Infinity;
        for (const date of allDates) {
          const dx = Math.abs((xScale(date) ?? 0) - mx);
          if (dx < closestDist) {
            closestDist = dx;
            closestDate = date;
          }
        }

        const lines = [`<strong>${closestDate}</strong>`];
        // Sort tooltip entries by percent descending for this date
        const entries = visibleSeries
          .map((s) => ({
            label: s.label,
            point: s.points.find((p) => p.date === closestDate),
            color: colorMap.get(s.label) ?? '#888',
          }))
          .filter((e) => e.point)
          .sort((a, b) => (b.point?.percent ?? 0) - (a.point?.percent ?? 0));

        for (const e of entries) {
          lines.push(
            `<span style="color:${e.color}">${e.label}</span>: ${e.point!.percent.toFixed(1)}%`
          );
        }

        const containerRect = containerRef.current!.getBoundingClientRect();
        const svgRect = svgRef.current!.getBoundingClientRect();
        const tooltipX =
          (xScale(closestDate) ?? 0) +
          MARGIN.left +
          (svgRect.left - containerRect.left) +
          15;
        const tooltipY = event.clientY - containerRect.top - 10;

        tooltip
          .html(lines.join('<br/>'))
          .style('left', `${tooltipX}px`)
          .style('top', `${tooltipY}px`)
          .style('opacity', 1);

        g.selectAll('.hover-line').remove();
        g.append('line')
          .attr('class', 'hover-line')
          .attr('x1', xScale(closestDate) ?? 0)
          .attr('x2', xScale(closestDate) ?? 0)
          .attr('y1', 0)
          .attr('y2', innerHeight)
          .attr('stroke', chartColors.tooltipBorder)
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '3,3');
      })
      .on('mouseleave', () => {
        tooltip.style('opacity', 0);
        g.selectAll('.hover-line').remove();
      });
  }, [series, visibleSeries, versionReleases, releaseTickFilter, yAxisMode, chartMode, theme, colorMap, chartColors]);

  const hasHidden = hiddenSeries.size > 0;
  const hasBelowThreshold = series.some((s) => s.belowThreshold);

  return (
    <div
      className={styles.container}
      ref={containerRef}
      style={{ position: 'relative' }}
    >
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
        <SegmentedControl
          options={RELEASE_TICK_OPTIONS}
          value={releaseTickFilter}
          onChange={onReleaseTickFilterChange}
          label="Releases"
        />
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
      </div>

      {series.length === 0 ? (
        <div className={styles.noData}>
          No historical snapshot data available. Track this package to start
          collecting adoption data over time.
        </div>
      ) : (
        <>
          <div className={styles.chart}>
            <svg ref={svgRef} />
          </div>

          {/* Legend with click-to-toggle */}
          <div className={styles.legend}>
            {series.map((s) => {
              const color = colorMap.get(s.label) ?? '#888';
              const isHidden = hiddenSeries.has(s.label);
              const isBelowLPF = s.belowThreshold;
              return (
                <div
                  key={s.label}
                  className={`${styles.legendItem} ${isHidden ? styles.legendItemDimmed : ''} ${isBelowLPF && !isHidden ? styles.legendItemBelowLPF : ''}`}
                  onClick={() => toggleSeries(s.label)}
                  title={
                    isBelowLPF
                      ? `Below LPF threshold (${(lowPassFilter * 100).toFixed(1)}%)`
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
            })}
          </div>
        </>
      )}
    </div>
  );
});
