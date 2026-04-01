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
import { ChartDescription } from './chart-description';
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
}: {
  snapshots: Snapshot[];
  liveData: NpmDownloadsByVersion | null;
  versionReleases: VersionRelease[];
  lowPassFilter: number;
  totalDownloads: DailyDownloadPoint[];
  timeWindow: TimeWindow;
  onTimeWindowChange: (v: TimeWindow) => void;
}) {
  const { theme } = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [grouping, setGrouping] = useState<AdoptionGrouping>('major');
  const [yAxisMode, setYAxisMode] = useState<YAxisMode>('percent');
  const [chartMode, setChartMode] = useState<ChartMode>('stacked');
  const [showReleaseTicks, setShowReleaseTicks] = useState(true);
  const [releaseTickLevel, setReleaseTickLevel] = useState<ReleaseTickLevel | null>(null);

  const effectiveTickLevel: ReleaseTickLevel = releaseTickLevel ?? grouping;

  const timeWindowCutoff = useMemo(() => getTimeWindowCutoff(timeWindow), [timeWindow]);

  const filteredSnapshots = useMemo(() => {
    if (!timeWindowCutoff) return snapshots;
    const cutoffStr = timeWindowCutoff.toISOString().slice(0, 10);
    const inWindow = snapshots.filter((s) => s.date >= cutoffStr);
    // When the cutoff falls between snapshots, create a synthetic snapshot
    // at the cutoff date using the last pre-cutoff snapshot's data. This
    // anchors the chart at real version percentages instead of 100% unknown,
    // without extending the X-axis beyond the window.
    const preCutoff = snapshots.filter((s) => s.date < cutoffStr);
    if (preCutoff.length > 0 && (inWindow.length === 0 || inWindow[0].date > cutoffStr)) {
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
    [filteredSnapshots, liveData, grouping, lowPassFilter, filteredTotalDownloads]
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

  // Exclude series that are always zero (no meaningful data points)
  const nonZeroSeries = useMemo(
    () => series.filter((s) => s.points.some((p) => p.percent > 0 || p.count > 0)),
    [series]
  );

  const visibleSeries = useMemo(
    () => nonZeroSeries.filter((s) => !hiddenSeries.has(s.label)),
    [nonZeroSeries, hiddenSeries]
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

    // Collect all dates and build a time scale
    const allDates = Array.from(
      new Set(series.flatMap((s) => s.points.map((p) => p.date)))
    ).sort();

    const parseDate = (d: string) => new Date(d + 'T00:00:00');
    const dateParsed = allDates.map(parseDate);
    const dateMap = new Map(allDates.map((d, i) => [d, dateParsed[i]]));

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(dateParsed) as [Date, Date])
      .range([0, innerWidth]);

    const xDate = (d: string) => xScale(dateMap.get(d)!);

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
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(8)
          .tickFormat((d) => d3.timeFormat('%b %d, %Y')(d as Date))
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
        .x((d) => xDate((d.data as Record<string, string>).date))
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
        .x((d) => xDate(d.date))
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
          .attr('cx', (d) => xDate(d.date))
          .attr('cy', (d) => yScale(d[valueKey]))
          .attr('r', 3)
          .attr('fill', color)
          .attr('stroke', theme === 'dark' ? '#1e1e1e' : '#ffffff')
          .attr('stroke-width', 1.5);
      }
    }

    // Version release markers (vertical ticks)
    if (showReleaseTicks && allDates.length >= 2) {
      const [domainStart, domainEnd] = xScale.domain();
      const filtered = filterReleasesByLevel(versionReleases, effectiveTickLevel);
      renderReleaseTicks(
        g as unknown as d3.Selection<SVGGElement, unknown, null, undefined>,
        filtered,
        (date) => {
          const vrDate = parseDate(date);
          if (vrDate < domainStart || vrDate > domainEnd) return null;
          return xScale(vrDate);
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
          const dx = Math.abs(xDate(date) - mx);
          if (dx < closestDist) {
            closestDist = dx;
            closestDate = date;
          }
        }

        const lines = [`<strong>${closestDate}</strong>`];
        // Sort tooltip entries by the active metric descending for this date
        const entries = visibleSeries
          .map((s) => ({
            label: s.label,
            point: s.points.find((p) => p.date === closestDate),
            color: colorMap.get(s.label) ?? '#888',
          }))
          .filter((e) => e.point && (e.point.percent > 0 || e.point.count > 0))
          .sort((a, b) =>
            yAxisMode === 'percent'
              ? (b.point?.percent ?? 0) - (a.point?.percent ?? 0)
              : (b.point?.count ?? 0) - (a.point?.count ?? 0)
          );

        let total = 0;
        for (const e of entries) {
          const value = yAxisMode === 'percent'
            ? `${e.point!.percent.toFixed(1)}%`
            : formatDownloadCount(e.point!.count);
          total += e.point!.count;
          lines.push(
            `<span style="color:${e.color}">${e.label}</span>: ${value}`
          );
        }
        if (yAxisMode === 'count') {
          lines.push(`<strong>Total</strong>: ${formatDownloadCount(total)}`);
        }

        const containerRect = containerRef.current!.getBoundingClientRect();
        const svgRect = svgRef.current!.getBoundingClientRect();
        const tooltipX =
          xDate(closestDate) +
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
          .attr('x1', xDate(closestDate))
          .attr('x2', xDate(closestDate))
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
  }, [series, visibleSeries, versionReleases, effectiveTickLevel, showReleaseTicks, yAxisMode, chartMode, theme, colorMap, chartColors]);

  const hasHidden = hiddenSeries.size > 0;
  const hasBelowThreshold = nonZeroSeries.some((s) => s.belowThreshold);

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
      </div>

      <ChartDescription>
        {chartMode === 'stacked'
          ? `Stacked area chart showing each ${grouping} version's share of downloads over time.`
          : `Line chart showing each ${grouping} version's download trend over time.`}
        {' '}
        {yAxisMode === 'percent'
          ? 'The Y-axis shows percentage share of total downloads.'
          : 'The Y-axis shows absolute download counts.'}
        {' '}
        {`Versions grouped by ${grouping} version number${
          lowPassFilter > 0
            ? ` — versions below ${(lowPassFilter * 100).toFixed(1)}% are dimmed in the legend and can be bulk-hidden`
            : ''
        }.`}
        {' Click legend items to show/hide individual series.'}
      </ChartDescription>

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
            {nonZeroSeries.map((s) => {
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
