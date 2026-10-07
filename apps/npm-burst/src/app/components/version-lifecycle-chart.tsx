import { memo, useMemo } from 'react';
import { barX, defineChart, dot, text, tickX } from '@tanstack/charts';
import type { ChartPoint } from '@tanstack/charts';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { tooltip } from '@tanstack/charts/tooltip';
import { scaleTime } from 'd3-scale';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';
import { useTheme } from '../context/theme-context';
import { useAppStore } from '../store';
import { formatDay, formatMonth, parseDay } from '../utils/chart-kit';
import { generateThemeColorPalette } from '../utils/theme-colors';
import { getTimeWindowCutoff, TIME_WINDOW_OPTIONS } from '../utils/time-window';
import { getVersionLifecycleData } from '../utils/version-lifecycle';
import type { LifecycleMilestone } from '../utils/version-lifecycle';
import { ChartDescription } from './chart-description';
import { SegmentedControl } from './segmented-control';
import styles from './version-lifecycle-chart.module.scss';

const MARGIN = { left: 50, right: 90 };
const ROW_HEIGHT = 50;
const BAR_HEIGHT = 20;

/** Space for the x axis below the rows. */
const AXIS_HEIGHT = 50;

/** Ramp-up labels need this many pixels of bar to fit. */
const MIN_LABEL_WIDTH = 30;

type Phase = 'ramp' | 'above' | 'never';

const PHASE_OPACITY: Record<Phase, number> = {
  ramp: 0.3,
  above: 0.7,
  never: 0.15,
};

interface LifecycleBar {
  milestone: LifecycleMilestone;
  phase: Phase;
  /** Bar start and end as epoch milliseconds. */
  start: number;
  end: number;
}

interface RowLabel {
  label: string;
  x: Date;
  text: string;
}

interface Layout {
  bars: LifecycleBar[];
  ongoing: RowLabel[];
  nextMajor: RowLabel[];
  neverReached: RowLabel[];
  rampLabels: (RowLabel & { width: number })[];
  domain: [Date, Date];
}

function percent(value: number): string {
  return `${value.toFixed(0)}%`;
}

function formatDate(day: string | null): string {
  return day ? formatDay(parseDay(day)) : '—';
}

function buildLayout(milestones: LifecycleMilestone[]): Layout {
  const today = parseDay(new Date().toISOString().slice(0, 10));
  const todayMs = today.getTime();
  const layout: Layout = {
    bars: [],
    ongoing: [],
    nextMajor: [],
    neverReached: [],
    rampLabels: [],
    domain: [today, today],
  };

  let minMs = todayMs;
  let maxMs = todayMs;
  const track = (day: string | null) => {
    if (!day) return;
    const ms = parseDay(day).getTime();
    minMs = Math.min(minMs, ms);
    maxMs = Math.max(maxMs, ms);
  };

  for (const m of milestones) {
    track(m.releaseDate);
    track(m.reachedThresholdDate);
    track(m.nextMajorReleaseDate);
    track(m.droppedBelowDate);

    const releaseMs = parseDay(m.releaseDate).getTime();
    const bar = (phase: Phase, start: number, end: number) =>
      layout.bars.push({ milestone: m, phase, start, end });

    if (m.reachedThresholdDate) {
      const thresholdMs = parseDay(m.reachedThresholdDate).getTime();
      bar('ramp', releaseMs, thresholdMs);
      if (m.daysToReachThreshold !== null) {
        layout.rampLabels.push({
          label: m.label,
          x: new Date((releaseMs + thresholdMs) / 2),
          text: `${m.daysToReachThreshold}d ↑`,
          width: thresholdMs - releaseMs,
        });
      }

      const endMs = m.droppedBelowDate
        ? parseDay(m.droppedBelowDate).getTime()
        : m.stillAboveThreshold
        ? todayMs
        : thresholdMs;
      if (endMs > thresholdMs) {
        bar('above', thresholdMs, endMs);
        if (m.stillAboveThreshold && !m.droppedBelowDate) {
          layout.ongoing.push({ label: m.label, x: today, text: '→' });
        }
      }

      if (m.nextMajorReleaseDate) {
        layout.nextMajor.push({
          label: m.label,
          x: parseDay(m.nextMajorReleaseDate),
          text:
            m.daysPersistingAfterNext === null
              ? ''
              : `+${m.daysPersistingAfterNext}d`,
        });
      }
    } else {
      // Concluded versions end at the next major; pending ones run to today.
      const endMs =
        m.neverReached && m.nextMajorReleaseDate
          ? parseDay(m.nextMajorReleaseDate).getTime()
          : todayMs;
      bar('never', releaseMs, endMs);
      if (m.neverReached) {
        layout.neverReached.push({
          label: m.label,
          x: new Date((releaseMs + endMs) / 2),
          text: `peak ${percent(m.peakPercent)}`,
        });
      }
    }
  }

  layout.domain = [new Date(minMs), new Date(maxMs)];
  return layout;
}

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
  const threshold = useAppStore((s) => s.lifecycleThreshold);
  const setThreshold = useAppStore((s) => s.setLifecycleThreshold);
  const timeWindow = useAppStore((s) => s.timeWindow);
  const onTimeWindowChange = useAppStore((s) => s.setTimeWindow);
  const showOnlySnapshotted = useAppStore(
    (s) => s.lifecycleShowOnlySnapshotted
  );
  const onShowOnlySnapshottedChange = useAppStore(
    (s) => s.setLifecycleShowOnlySnapshotted
  );
  const minPeak = useAppStore((s) => s.lifecycleMinPeak);
  const onMinPeakChange = useAppStore((s) => s.setLifecycleMinPeak);

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

  const filteredMilestones = useMemo(() => {
    let result = milestones;

    // Filter by time window
    const cutoff = getTimeWindowCutoff(timeWindow);
    if (cutoff) {
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      result = result.filter((m) => {
        return (
          m.releaseDate >= cutoffStr ||
          m.stillAboveThreshold ||
          (m.droppedBelowDate && m.droppedBelowDate >= cutoffStr)
        );
      });
    }

    // Filter pre-snapshot versions
    if (showOnlySnapshotted && snapshots.length > 0) {
      const earliestSnapshot = snapshots[0].date;
      result = result.filter((m) => m.releaseDate >= earliestSnapshot);
    }

    // Filter by min peak
    if (minPeak > 0) {
      result = result.filter((m) => m.peakPercent >= minPeak);
    }

    return result;
  }, [milestones, timeWindow, showOnlySnapshotted, snapshots, minPeak]);

  const palette = useMemo(
    () => generateThemeColorPalette(filteredMilestones.length + 1, theme),
    [filteredMilestones.length, theme]
  );

  const definition = useMemo(() => {
    const labels = filteredMilestones.map((m) => m.label);
    const layout = buildLayout(filteredMilestones);
    const [minDate, maxDate] = layout.domain;
    const spanMs = Math.max(1, maxDate.getTime() - minDate.getTime());

    const barMark = (phase: Phase) =>
      barX(
        layout.bars.filter((b) => b.phase === phase),
        {
          id: `lifecycle-${phase}`,
          x1: 'start',
          x2: 'end',
          y: (b) => b.milestone.label,
          color: (b) => b.milestone.label,
          key: (b) => `${b.milestone.label}:${phase}`,
          fillOpacity: PHASE_OPACITY[phase],
          maxThickness: BAR_HEIGHT,
          radius: 3,
        }
      );

    return defineChart({
      chart: ({ width }) => {
        const pxPerMs = (width - MARGIN.left - MARGIN.right) / spanMs;
        return {
          marks: [
            barMark('ramp'),
            barMark('above'),
            barMark('never'),
            decorative(
              text(
                layout.rampLabels.filter(
                  (l) => l.width * pxPerMs > MIN_LABEL_WIDTH
                ),
                {
                  id: 'ramp-labels',
                  x: 'x',
                  y: 'label',
                  text: 'text',
                  fill: 'currentColor',
                  fontSize: 10,
                }
              )
            ),
            decorative(
              text(layout.neverReached, {
                id: 'never-reached-labels',
                x: 'x',
                y: 'label',
                text: 'text',
                fill: 'currentColor',
                fontSize: 9,
              })
            ),
            decorative(
              text(layout.ongoing, {
                id: 'ongoing-arrows',
                x: 'x',
                y: 'label',
                text: 'text',
                color: 'label',
                fontSize: 10,
                anchor: 'start',
                dx: 4,
              })
            ),
            decorative(
              tickX(layout.nextMajor, {
                id: 'next-major-ticks',
                x: 'x',
                y: 'label',
                stroke: 'currentColor',
                strokeOpacity: 0.8,
                strokeWidth: 1.5,
                length: BAR_HEIGHT + 8,
              })
            ),
            decorative(
              text(layout.nextMajor, {
                id: 'next-major-labels',
                x: 'x',
                y: 'label',
                text: 'text',
                fill: 'currentColor',
                fontSize: 9,
                anchor: 'start',
                dx: 3,
                dy: -(BAR_HEIGHT / 2 + 9),
              })
            ),
            decorative(
              dot(filteredMilestones, {
                id: 'release-dots',
                x: (m) => parseDay(m.releaseDate),
                y: 'label',
                color: 'label',
                r: 4,
                stroke: 'var(--bg-primary)',
                strokeWidth: 1.5,
              })
            ),
            decorative(
              text(filteredMilestones, {
                id: 'peak-annotations',
                x: () => maxDate,
                y: 'label',
                text: (m) => `Peak: ${percent(m.peakPercent)}`,
                fill: 'currentColor',
                fontSize: 10,
                anchor: 'start',
                dx: 18,
                dy: -7,
              })
            ),
            decorative(
              text(filteredMilestones, {
                id: 'now-annotations',
                x: () => maxDate,
                y: 'label',
                text: (m) => `Now: ${percent(m.currentPercent)}`,
                fill: 'currentColor',
                fontSize: 10,
                anchor: 'start',
                dx: 18,
                dy: 7,
              })
            ),
          ],
          scales: {
            x: {
              scale: scaleTime().domain(layout.domain),
              grid: { strokeOpacity: 0.3 },
              axis: {
                ticks: {
                  count: 6,
                  format: (v: number | Date) => formatMonth(new Date(v)),
                },
              },
            },
            y: {
              scale: scaleBand<string>().domain(labels).padding(0.2),
              axis: {
                line: false,
                ticks: { size: 0 },
                tickLabels: { fontSize: 12, fontWeight: 600 },
              },
            },
          },
          color: { domain: labels, range: palette },
          margin: MARGIN,
        };
      },
      tooltip: {
        use: tooltip,
        content: (points: readonly ChartPoint<LifecycleBar>[]) => {
          const m = points[0]?.datum.milestone;
          if (!m) return { rows: [] };
          return {
            title: m.label,
            rows: [
              { label: 'Released', value: formatDate(m.releaseDate) },
              {
                label: `Reached ${threshold}%`,
                value: formatDate(m.reachedThresholdDate),
              },
              {
                label: 'Next major',
                value: formatDate(m.nextMajorReleaseDate),
              },
              {
                label: `Below ${threshold}%`,
                value: m.stillAboveThreshold
                  ? 'still above'
                  : formatDate(m.droppedBelowDate),
              },
              { label: 'Peak', value: percent(m.peakPercent) },
              { label: 'Now', value: percent(m.currentPercent) },
            ],
          };
        },
      },
    });
  }, [filteredMilestones, palette, threshold]);

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <SegmentedControl
          options={TIME_WINDOW_OPTIONS}
          value={timeWindow}
          onChange={onTimeWindowChange}
          label="Window"
        />
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
        <div className={styles.thresholdGroup}>
          <span className={styles.thresholdLabel}>Min peak</span>
          <input
            type="number"
            step={5}
            min={0}
            max={100}
            value={minPeak}
            onChange={(e) => {
              const val = e.target.valueAsNumber;
              if (!Number.isNaN(val) && val >= 0 && val <= 100)
                onMinPeakChange(val);
            }}
            className={styles.thresholdInput}
          />
          <span className={styles.thresholdSuffix}>%</span>
        </div>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={showOnlySnapshotted}
            onChange={(e) => onShowOnlySnapshottedChange(e.target.checked)}
            className={styles.checkbox}
          />
          Only tracked versions
        </label>
      </div>

      {filteredMilestones.length === 0 ? (
        <div className={styles.noData}>
          No historical snapshot data or version release information available.
          Track this package to start collecting lifecycle data.
        </div>
      ) : (
        <>
          <Chart
            className={styles.chart}
            definition={definition}
            height={filteredMilestones.length * ROW_HEIGHT + AXIS_HEIGHT}
            initialWidth={900}
            ariaLabel="Major version lifecycle"
          />
          <ul className={styles.legend}>
            <li className={styles.legendItem}>
              <span
                className={styles.legendBar}
                style={{ opacity: PHASE_OPACITY.ramp }}
              />
              Ramp-up (below {threshold}%)
            </li>
            <li className={styles.legendItem}>
              <span
                className={styles.legendBar}
                style={{ opacity: PHASE_OPACITY.above }}
              />
              Above {threshold}%
            </li>
            <li className={styles.legendItem}>
              <span
                className={styles.legendBar}
                style={{ opacity: PHASE_OPACITY.never }}
              />
              Never reached {threshold}%
            </li>
            <li className={styles.legendItem}>
              <span className={styles.legendDot} />
              Release
            </li>
            <li className={styles.legendItem}>
              <span className={styles.legendTick} />
              Next major released
            </li>
          </ul>
        </>
      )}
      <ChartDescription>
        <p>Major version lifecycle — release through peak to decline.</p>
        <ul>
          <li>Adoption threshold: {threshold}%</li>
          {showOnlySnapshotted && <li>Tracked versions only</li>}
          {minPeak > 0 && <li>Hiding below {minPeak}% peak</li>}
        </ul>
      </ChartDescription>
    </div>
  );
});
