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
import {
  getVersionAdoptionData,
  VersionAdoptionSeries,
} from '../utils/version-adoption';
import styles from './version-adoption-chart.module.scss';

const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };
const CHART_HEIGHT = 350;

export const VersionAdoptionChart = memo(function VersionAdoptionChart({
  snapshots,
  liveData,
  versionReleases,
}: {
  snapshots: Snapshot[];
  liveData: NpmDownloadsByVersion | null;
  versionReleases: VersionRelease[];
}) {
  const { theme } = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const series = useMemo(
    () => getVersionAdoptionData(snapshots, liveData, versionReleases),
    [snapshots, liveData, versionReleases]
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

  const visibleSeries = useMemo(
    () => series.filter((s) => !hiddenSeries.has(s.label)),
    [series, hiddenSeries]
  );

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || series.length === 0) return;

    const containerWidth = containerRef.current.clientWidth;
    const width = containerWidth;
    const height = CHART_HEIGHT;
    const innerWidth = width - MARGIN.left - MARGIN.right;
    const innerHeight = height - MARGIN.top - MARGIN.bottom;

    const chartColors = getThemeChartColors(theme);
    const palette = generateThemeColorPalette(series.length, theme);

    // Color scale: map series labels to colors, "latest" gets a special treatment
    const colorMap = new Map<string, string>();
    let paletteIdx = 0;
    for (const s of series) {
      if (s.label === 'latest') {
        colorMap.set('latest', chartColors.centerFill);
      } else {
        colorMap.set(s.label, palette[paletteIdx % palette.length]);
        paletteIdx++;
      }
    }

    // Collect all dates
    const allDates = Array.from(
      new Set(series.flatMap((s) => s.points.map((p) => p.date)))
    ).sort();

    const xScale = d3
      .scalePoint<string>()
      .domain(allDates)
      .range([0, innerWidth])
      .padding(0.1);

    const yScale = d3
      .scaleLinear()
      .domain([0, 100])
      .range([innerHeight, 0]);

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
          .tickFormat((d) => `${d}%`)
      );

    // Line generator
    const lineGen = d3
      .line<{ date: string; percent: number }>()
      .x((d) => xScale(d.date) ?? 0)
      .y((d) => yScale(d.percent))
      .curve(d3.curveMonotoneX);

    // Draw lines for visible series
    for (const s of visibleSeries) {
      const color = colorMap.get(s.label) ?? '#888';
      const isLatest = s.label === 'latest';

      g.append('path')
        .datum(s.points)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', isLatest ? 2.5 : 2)
        .attr('stroke-dasharray', isLatest ? '6,3' : 'none')
        .attr('d', lineGen);

      // Dots
      g.selectAll(null)
        .data(s.points)
        .join('circle')
        .attr('cx', (d) => xScale(d.date) ?? 0)
        .attr('cy', (d) => yScale(d.percent))
        .attr('r', 3)
        .attr('fill', color)
        .attr('stroke', theme === 'dark' ? '#1e1e1e' : '#ffffff')
        .attr('stroke-width', 1.5);
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
        // Find closest date
        let closestDate = allDates[0];
        let closestDist = Infinity;
        for (const date of allDates) {
          const dx = Math.abs((xScale(date) ?? 0) - mx);
          if (dx < closestDist) {
            closestDist = dx;
            closestDate = date;
          }
        }

        // Build tooltip content
        const lines = [`<strong>${closestDate}</strong>`];
        for (const s of visibleSeries) {
          const point = s.points.find((p) => p.date === closestDate);
          if (point) {
            const color = colorMap.get(s.label) ?? '#888';
            lines.push(
              `<span style="color:${color}">${s.label}</span>: ${point.percent.toFixed(1)}%`
            );
          }
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

        // Vertical indicator line
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
  }, [series, visibleSeries, theme]);

  if (series.length === 0) {
    return (
      <div className={styles.noData}>
        No historical snapshot data available. Track this package to start
        collecting adoption data over time.
      </div>
    );
  }

  // Build palette for legend
  const chartColors = getThemeChartColors(theme);
  const palette = generateThemeColorPalette(series.length, theme);
  const colorMap = new Map<string, string>();
  let paletteIdx = 0;
  for (const s of series) {
    if (s.label === 'latest') {
      colorMap.set('latest', chartColors.centerFill);
    } else {
      colorMap.set(s.label, palette[paletteIdx % palette.length]);
      paletteIdx++;
    }
  }

  return (
    <div className={styles.container} ref={containerRef} style={{ position: 'relative' }}>
      <div className={styles.chart}>
        <svg ref={svgRef} />
      </div>
      <div className={styles.legend}>
        {series.map((s) => {
          const color = colorMap.get(s.label) ?? '#888';
          const isDimmed = hiddenSeries.has(s.label);
          return (
            <div
              key={s.label}
              className={`${styles.legendItem} ${isDimmed ? styles.legendItemDimmed : ''}`}
              onClick={() => toggleSeries(s.label)}
            >
              <span
                className={
                  s.label === 'latest'
                    ? styles.legendSwatchLatest
                    : styles.legendSwatch
                }
                style={
                  s.label === 'latest'
                    ? { borderColor: color }
                    : { backgroundColor: color }
                }
              />
              {s.label}
            </div>
          );
        })}
      </div>
    </div>
  );
});
