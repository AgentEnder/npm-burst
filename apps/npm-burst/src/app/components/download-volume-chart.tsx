import * as d3 from 'd3';
import { memo, useEffect, useMemo, useRef } from 'react';
import type { DailyDownloadPoint } from '../../server/functions/total-downloads.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import { useTheme } from '../context/theme-context';
import {
  filterReleasesByLevel,
  renderReleaseTicks,
  RELEASE_TICK_OPTIONS,
} from '../utils/release-ticks';
import type { ReleaseTickLevel } from '../utils/release-ticks';
import { getTimeWindowCutoff, TIME_WINDOW_OPTIONS } from '../utils/time-window';
import type { TimeWindow } from '../utils/time-window';
import { getThemeChartColors } from '../utils/theme-colors';
import {
  getDownloadVolumeData,
  formatDownloadCount,
} from '../utils/download-volume';
import { ChartDescription } from './chart-description';
import { SegmentedControl } from './segmented-control';
import styles from './download-volume-chart.module.scss';

const MARGIN = { top: 20, right: 20, bottom: 60, left: 60 };
const CHART_HEIGHT = 350;

export const DownloadVolumeChart = memo(function DownloadVolumeChart({
  totalDownloads,
  versionReleases,
  timeWindow,
  onTimeWindowChange,
  releaseTickFilter,
  onReleaseTickFilterChange,
}: {
  totalDownloads: DailyDownloadPoint[];
  versionReleases: VersionRelease[];
  timeWindow: TimeWindow;
  onTimeWindowChange: (v: TimeWindow) => void;
  releaseTickFilter: ReleaseTickLevel;
  onReleaseTickFilterChange: (v: ReleaseTickLevel) => void;
}) {
  const { theme } = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const volumeData = useMemo(
    () => getDownloadVolumeData(totalDownloads),
    [totalDownloads]
  );

  const filteredVolumeData = useMemo(() => {
    const cutoff = getTimeWindowCutoff(timeWindow);
    if (!cutoff) return volumeData;
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return volumeData.filter((d) => d.date >= cutoffStr);
  }, [volumeData, timeWindow]);

  const chartColors = getThemeChartColors(theme);

  useEffect(() => {
    if (
      !svgRef.current ||
      !containerRef.current ||
      filteredVolumeData.length === 0
    )
      return;

    const containerWidth = containerRef.current.clientWidth;
    const width = containerWidth;
    const height = CHART_HEIGHT;
    const innerWidth = width - MARGIN.left - MARGIN.right;
    const innerHeight = height - MARGIN.top - MARGIN.bottom;

    const parseDate = (d: string) => new Date(d + 'T00:00:00');
    const dates = filteredVolumeData.map((d) => parseDate(d.date));
    const maxDownloads =
      d3.max(filteredVolumeData, (d) => d.totalDownloads) ?? 0;

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(dates) as [Date, Date])
      .range([0, innerWidth]);

    const yScale = d3
      .scaleLinear()
      .domain([0, maxDownloads * 1.1])
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
          .tickFormat((d) => formatDownloadCount(d as number))
      );

    // Area fill
    const areaGen = d3
      .area<{ date: string; totalDownloads: number }>()
      .x((d) => xScale(parseDate(d.date)))
      .y0(innerHeight)
      .y1((d) => yScale(d.totalDownloads))
      .curve(d3.curveMonotoneX);

    const lineColor =
      theme === 'dark' ? chartColors.centerFill : chartColors.centerHover;

    g.append('path')
      .datum(filteredVolumeData)
      .attr('fill', lineColor)
      .attr('fill-opacity', 0.15)
      .attr('d', areaGen);

    // Line
    const lineGen = d3
      .line<{ date: string; totalDownloads: number }>()
      .x((d) => xScale(parseDate(d.date)))
      .y((d) => yScale(d.totalDownloads))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(filteredVolumeData)
      .attr('fill', 'none')
      .attr('stroke', lineColor)
      .attr('stroke-width', 2.5)
      .attr('d', lineGen);

    // Version release markers (vertical ticks)
    const [domainStart, domainEnd] = xScale.domain();
    const filteredReleases = filterReleasesByLevel(
      versionReleases,
      releaseTickFilter
    );
    renderReleaseTicks(
      g as unknown as d3.Selection<SVGGElement, unknown, null, undefined>,
      filteredReleases,
      (date) => {
        const vrDate = parseDate(date);
        if (vrDate < domainStart || vrDate > domainEnd) return null;
        return xScale(vrDate);
      },
      innerHeight,
      theme
    );

    // Tooltip
    const tooltip = d3
      .select(containerRef.current)
      .selectAll<HTMLDivElement, unknown>('.volume-tooltip')
      .data([null])
      .join('div')
      .attr('class', 'volume-tooltip')
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
        const hoveredDate = xScale.invert(mx);

        // Find closest data point
        let closestIdx = 0;
        let closestDist = Infinity;
        for (let i = 0; i < filteredVolumeData.length; i++) {
          const dist = Math.abs(
            parseDate(filteredVolumeData[i].date).getTime() -
              hoveredDate.getTime()
          );
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
          }
        }

        const point = filteredVolumeData[closestIdx];
        if (!point) return;

        // Check if any version was released on this date
        const releasesOnDate = versionReleases.filter(
          (vr) => vr.date === point.date
        );

        const lines = [
          `<strong>${point.date}</strong>`,
          `Total: ${formatDownloadCount(point.totalDownloads)} downloads/week`,
        ];
        for (const vr of releasesOnDate) {
          lines.push(
            `<span style="color:${chartColors.tooltipTextSecondary}">Released: ${vr.version}</span>`
          );
        }

        const containerRect = containerRef.current!.getBoundingClientRect();
        const svgRect = svgRef.current!.getBoundingClientRect();
        const tooltipX =
          xScale(parseDate(point.date)) +
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
          .attr('x1', xScale(parseDate(point.date)))
          .attr('x2', xScale(parseDate(point.date)))
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
    filteredVolumeData,
    versionReleases,
    releaseTickFilter,
    theme,
    chartColors,
  ]);

  return (
    <div
      className={styles.container}
      ref={containerRef}
      style={{ position: 'relative' }}
    >
      <div className={styles.controls}>
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
      </div>
      <ChartDescription
        parts={[
          'Total downloads — 7-day rolling sum',
          `Release markers: ${releaseTickFilter}`,
          'Hover for exact counts',
        ]}
      />
      {filteredVolumeData.length === 0 ? (
        <div className={styles.noData}>
          No download volume data available for this package.
        </div>
      ) : (
        <div className={styles.chart}>
          <svg ref={svgRef} />
        </div>
      )}
    </div>
  );
});
