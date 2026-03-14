import * as d3 from 'd3';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';
import { useTheme } from '../context/theme-context';
import {
  generateThemeColorPalette,
  getThemeChartColors,
} from '../utils/theme-colors';
import {
  getVersionLifecycleData,
  LifecycleMilestone,
} from '../utils/version-lifecycle';
import styles from './version-lifecycle-chart.module.scss';

const MARGIN = { top: 20, right: 200, bottom: 30, left: 60 };
const ROW_HEIGHT = 50;
const BAR_HEIGHT = 20;

export const VersionLifecycleChart = memo(function VersionLifecycleChart({
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
  const [threshold, setThreshold] = useState(50);

  const milestones = useMemo(
    () =>
      getVersionLifecycleData(
        snapshots,
        liveData,
        versionReleases,
        threshold / 100
      ),
    [snapshots, liveData, versionReleases, threshold]
  );

  const chartColors = getThemeChartColors(theme);
  const palette = generateThemeColorPalette(milestones.length + 1, theme);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || milestones.length === 0)
      return;

    const containerWidth = containerRef.current.clientWidth;
    const width = containerWidth;
    const height = MARGIN.top + milestones.length * ROW_HEIGHT + MARGIN.bottom;
    const innerWidth = width - MARGIN.left - MARGIN.right;

    // Find the range of dates
    const allDates: string[] = [];
    for (const m of milestones) {
      allDates.push(m.releaseDate);
      if (m.reachedThresholdDate) allDates.push(m.reachedThresholdDate);
      if (m.nextMajorReleaseDate) allDates.push(m.nextMajorReleaseDate);
      if (m.droppedBelowDate) allDates.push(m.droppedBelowDate);
    }

    // Add today as the latest possible date
    const today = new Date().toISOString().slice(0, 10);
    allDates.push(today);

    const dateExtent = d3.extent(allDates) as [string, string];
    const minDate = new Date(dateExtent[0] + 'T00:00:00');
    const maxDate = new Date(dateExtent[1] + 'T00:00:00');

    const xScale = d3
      .scaleTime()
      .domain([minDate, maxDate])
      .range([0, innerWidth]);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width);

    const g = svg
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // X axis
    g.append('g')
      .attr('class', 'axis')
      .attr(
        'transform',
        `translate(0,${milestones.length * ROW_HEIGHT})`
      )
      .call(
        d3
          .axisBottom(xScale)
          .ticks(6)
          .tickFormat((d) => d3.timeFormat('%b %Y')(d as Date))
      );

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisBottom(xScale)
          .ticks(6)
          .tickSize(milestones.length * ROW_HEIGHT)
          .tickFormat(() => '')
      )
      .attr('transform', 'translate(0,0)');

    const parseDate = (d: string) => new Date(d + 'T00:00:00');
    const todayDate = parseDate(today);

    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      const y = i * ROW_HEIGHT + ROW_HEIGHT / 2;
      const color = palette[i % palette.length];

      // Version label
      g.append('text')
        .attr('x', -8)
        .attr('y', y + 4)
        .attr('text-anchor', 'end')
        .attr('font-size', '12px')
        .attr('font-weight', '600')
        .attr('fill', color)
        .text(m.label);

      const releaseX = xScale(parseDate(m.releaseDate));

      // Ramp-up phase: release → reached threshold
      if (m.reachedThresholdDate) {
        const thresholdX = xScale(parseDate(m.reachedThresholdDate));
        // Ramp-up bar (lighter shade)
        g.append('rect')
          .attr('x', releaseX)
          .attr('y', y - BAR_HEIGHT / 2)
          .attr('width', Math.max(0, thresholdX - releaseX))
          .attr('height', BAR_HEIGHT)
          .attr('fill', color)
          .attr('fill-opacity', 0.3)
          .attr('rx', 3);

        // Label: days to reach threshold
        if (m.daysToReachThreshold !== null && thresholdX - releaseX > 30) {
          g.append('text')
            .attr('x', (releaseX + thresholdX) / 2)
            .attr('y', y + 4)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr(
              'fill',
              theme === 'dark'
                ? 'rgba(255,255,255,0.7)'
                : 'rgba(0,0,0,0.6)'
            )
            .text(`${m.daysToReachThreshold}d ↑`);
        }

        // Above-threshold phase: threshold reached → dropped below (or ongoing)
        const endX = m.droppedBelowDate
          ? xScale(parseDate(m.droppedBelowDate))
          : m.stillAboveThreshold
            ? xScale(todayDate)
            : thresholdX;

        if (endX > thresholdX) {
          g.append('rect')
            .attr('x', thresholdX)
            .attr('y', y - BAR_HEIGHT / 2)
            .attr('width', Math.max(0, endX - thresholdX))
            .attr('height', BAR_HEIGHT)
            .attr('fill', color)
            .attr('fill-opacity', 0.7)
            .attr('rx', 3);

          // If still above threshold, add open-ended indicator
          if (m.stillAboveThreshold && !m.droppedBelowDate) {
            g.append('text')
              .attr('x', endX + 4)
              .attr('y', y + 4)
              .attr('font-size', '10px')
              .attr('fill', color)
              .text('→');
          }
        }

        // Mark where next major was released (vertical tick on the bar)
        if (m.nextMajorReleaseDate) {
          const nextX = xScale(parseDate(m.nextMajorReleaseDate));
          g.append('line')
            .attr('x1', nextX)
            .attr('x2', nextX)
            .attr('y1', y - BAR_HEIGHT / 2 - 4)
            .attr('y2', y + BAR_HEIGHT / 2 + 4)
            .attr('stroke', theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)')
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '2,2');

          // Persistence label
          if (m.daysPersistingAfterNext !== null) {
            g.append('text')
              .attr('x', nextX + 3)
              .attr('y', y - BAR_HEIGHT / 2 - 6)
              .attr('font-size', '9px')
              .attr(
                'fill',
                theme === 'dark'
                  ? 'rgba(255,255,255,0.5)'
                  : 'rgba(0,0,0,0.4)'
              )
              .text(`+${m.daysPersistingAfterNext}d`);
          }
        }
      } else {
        // Never reached threshold — show a thin line from release to today
        g.append('rect')
          .attr('x', releaseX)
          .attr('y', y - BAR_HEIGHT / 2)
          .attr('width', Math.max(0, xScale(todayDate) - releaseX))
          .attr('height', BAR_HEIGHT)
          .attr('fill', color)
          .attr('fill-opacity', 0.15)
          .attr('rx', 3);
      }

      // Release date marker (diamond)
      g.append('circle')
        .attr('cx', releaseX)
        .attr('cy', y)
        .attr('r', 4)
        .attr('fill', color)
        .attr('stroke', theme === 'dark' ? '#1e1e1e' : '#ffffff')
        .attr('stroke-width', 1.5);

      // Annotation: peak % and current %
      const annotationX = innerWidth + 10;
      g.append('text')
        .attr('x', annotationX)
        .attr('y', y - 4)
        .attr('font-size', '10px')
        .attr('fill', theme === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)')
        .text(`Peak: ${m.peakPercent.toFixed(0)}%`);
      g.append('text')
        .attr('x', annotationX)
        .attr('y', y + 10)
        .attr('font-size', '10px')
        .attr('fill', theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)')
        .text(`Now: ${m.currentPercent.toFixed(0)}%`);
    }

    // Legend explaining bar segments
    const legendY = milestones.length * ROW_HEIGHT + 25;
    const legendItems = [
      { label: `Ramp-up (below ${threshold}%)`, opacity: 0.3 },
      { label: `Above ${threshold}%`, opacity: 0.7 },
    ];
    let legendX = 0;
    for (const item of legendItems) {
      g.append('rect')
        .attr('x', legendX)
        .attr('y', legendY)
        .attr('width', 12)
        .attr('height', 8)
        .attr('fill', theme === 'dark' ? '#4ecdc4' : '#2a9d8f')
        .attr('fill-opacity', item.opacity)
        .attr('rx', 2);
      g.append('text')
        .attr('x', legendX + 16)
        .attr('y', legendY + 8)
        .attr('font-size', '10px')
        .attr('fill', theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)')
        .text(item.label);
      legendX += item.label.length * 6 + 30;
    }
  }, [milestones, threshold, theme, palette, chartColors]);

  if (milestones.length === 0) {
    return (
      <div className={styles.noData}>
        No historical snapshot data or version release information available.
        Track this package to start collecting lifecycle data.
      </div>
    );
  }

  return (
    <div
      className={styles.container}
      ref={containerRef}
      style={{ position: 'relative' }}
    >
      <div className={styles.controls}>
        <div className={styles.thresholdGroup}>
          <span className={styles.thresholdLabel}>Threshold</span>
          <input
            type="number"
            step={5}
            min={1}
            max={100}
            value={threshold}
            onChange={(e) => {
              const val = e.target.valueAsNumber;
              if (!Number.isNaN(val) && val > 0 && val <= 100)
                setThreshold(val);
            }}
            className={styles.thresholdInput}
          />
          <span className={styles.thresholdSuffix}>%</span>
        </div>
      </div>

      <div className={styles.chart}>
        <svg ref={svgRef} />
      </div>
    </div>
  );
});
