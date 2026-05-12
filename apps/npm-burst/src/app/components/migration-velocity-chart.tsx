import * as d3 from 'd3';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';
import { useTheme } from '../context/theme-context';
import {
  generateThemeColorPalette,
  getThemeChartColors,
} from '../utils/theme-colors';
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

const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };
const CHART_HEIGHT = 350;

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
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  const chartColors = getThemeChartColors(theme);
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    if (visibleSeries.length === 0) return map;
    const palette = generateThemeColorPalette(visibleSeries.length, theme);
    visibleSeries.forEach((s, i) => {
      map.set(s.label, palette[i % palette.length]);
    });
    return map;
  }, [visibleSeries, theme]);

  const hiddenSwatchColor =
    theme === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)';

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || series.length === 0) return;

    const containerWidth = containerRef.current.clientWidth;
    const width = containerWidth;
    const height = CHART_HEIGHT;
    const innerWidth = width - MARGIN.left - MARGIN.right;
    const innerHeight = height - MARGIN.top - MARGIN.bottom;

    // Find max days across all series
    const maxDays =
      d3.max(visibleSeries, (s) =>
        d3.max(s.points, (p) => p.daysSinceRelease)
      ) ?? 30;

    const windowMaxDays = getMigrationMaxDays(migrationTimeWindow);
    const effectiveMaxDays =
      windowMaxDays !== null ? Math.min(maxDays, windowMaxDays) : maxDays;

    const cappedSeries = visibleSeries.map((s) => ({
      ...s,
      points:
        windowMaxDays !== null
          ? s.points.filter((p) => p.daysSinceRelease <= windowMaxDays)
          : s.points,
    }));

    const xScale = d3
      .scaleLinear()
      .domain([0, effectiveMaxDays])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);

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
          .tickFormat((d) => `${d}d`)
      );

    // X axis label
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 35)
      .attr('text-anchor', 'middle')
      .attr(
        'fill',
        theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
      )
      .attr('font-size', '11px')
      .text('Days since release');

    // Y axis
    g.append('g')
      .attr('class', 'axis')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((d) => `${d}%`)
      );

    // Line generator
    const lineGen = d3
      .line<{ daysSinceRelease: number; percent: number }>()
      .x((d) => xScale(d.daysSinceRelease))
      .y((d) => yScale(d.percent))
      .curve(d3.curveMonotoneX);

    // Draw lines
    for (const s of cappedSeries) {
      const color = colorMap.get(s.label) ?? '#888';

      g.append('path')
        .datum(s.points)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('d', lineGen);

      // Dots
      g.selectAll(null)
        .data(s.points)
        .join('circle')
        .attr('cx', (d) => xScale(d.daysSinceRelease))
        .attr('cy', (d) => yScale(d.percent))
        .attr('r', 3)
        .attr('fill', color)
        .attr('stroke', theme === 'dark' ? '#1e1e1e' : '#ffffff')
        .attr('stroke-width', 1.5);
    }

    // Tooltip
    const tooltip = d3
      .select(containerRef.current)
      .selectAll<HTMLDivElement, unknown>('.migration-tooltip')
      .data([null])
      .join('div')
      .attr('class', 'migration-tooltip')
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
        const hoveredDay = Math.round(xScale.invert(mx));

        const lines = [`<strong>Day ${hoveredDay}</strong>`];
        const entries = cappedSeries
          .map((s) => {
            // Find closest point to this day
            let closest = s.points[0];
            let closestDist = Infinity;
            for (const p of s.points) {
              const dist = Math.abs(p.daysSinceRelease - hoveredDay);
              if (dist < closestDist) {
                closestDist = dist;
                closest = p;
              }
            }
            return {
              label: s.label,
              color: colorMap.get(s.label) ?? '#888',
              percent: closest?.percent ?? 0,
              dist: closestDist,
            };
          })
          .filter((e) => e.dist <= 3)
          .sort((a, b) => b.percent - a.percent);

        for (const e of entries) {
          lines.push(
            `<span style="color:${e.color}">${
              e.label
            }</span>: ${e.percent.toFixed(1)}%`
          );
        }

        const containerRect = containerRef.current!.getBoundingClientRect();
        const svgRect = svgRef.current!.getBoundingClientRect();
        const tooltipX =
          xScale(hoveredDay) +
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
          .attr('x1', xScale(hoveredDay))
          .attr('x2', xScale(hoveredDay))
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
  }, [
    series,
    visibleSeries,
    theme,
    colorMap,
    chartColors,
    migrationTimeWindow,
  ]);

  return (
    <div
      className={styles.container}
      ref={containerRef}
      style={{ position: 'relative' }}
    >
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
            <div className={styles.chart}>
              <svg ref={svgRef} />
            </div>
          )}

          <div className={styles.legend}>
            {filteredLegendSeries.length === 0 ? (
              <span className={styles.legendEmpty}>
                No versions match &ldquo;{legendFilter}&rdquo;
              </span>
            ) : (
              filteredLegendSeries.map((s) => {
                const isHidden = hiddenSeries.has(s.label);
                const color =
                  colorMap.get(s.label) ??
                  (isHidden ? hiddenSwatchColor : '#888');
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
    </div>
  );
});
