import { memo, useMemo, useState, type CSSProperties } from 'react';
import { defineChart, type ChartPoint } from '@tanstack/charts';
import {
  sunburst,
  type SunburstNode,
} from '@tanstack/charts/hierarchy/sunburst';
import { decorative } from '@tanstack/charts/mark/decorative';
import { motion } from '@tanstack/charts/motion';
import { polar, radialText } from '@tanstack/charts/polar';
import { Chart } from '@tanstack/charts/react/core';
import { tooltip } from '@tanstack/charts/tooltip';
import { scaleLinear } from 'd3-scale';
import { useTheme } from '../../context/theme-context';
import { generateThemeColorPalette, withAlpha } from '../../utils/theme-colors';
import {
  findDrillRootId,
  flattenSunburst,
  layoutSunburstLabels,
  sunburstComparator,
  type SunburstData,
  type SunburstLabel,
  type SunburstRow,
} from './sunburst-model';
import styles from './sunburst.module.scss';

type Node = SunburstNode<SunburstRow>;

/** The center disc and the two visible rings each take a third of the radius. */
const CENTER_RATIO = 1 / 3;
const RADIUS_RATIO = 0.98;

const VISIBLE_DEPTH = 2;
const LABEL_FONT_SIZE = 11;
const DRILL_DURATION = 750;

/** New labels appear once the sectors have nearly settled. */
const LABEL_ENTER_DELAY = DRILL_DURATION - 150;

/** Monospace glyph width as a fraction of the font size. */
const GLYPH_WIDTH = 0.6;

const downloadFormat = new Intl.NumberFormat('en-US');

/**
 * Labels that fit their sector at this radius.
 *
 * A radial label needs the arc at its mid radius to be taller than one line,
 * and the ring to be wider than the text. A child that repeats its parent's
 * name (`v1.2.3` under `v1.2.3`) stays hidden while the parent is labeled.
 */
function fittingLabels(
  labels: readonly SunburstLabel[],
  ringCount: number,
  radius: number
): SunburstLabel[] {
  const inner = radius * CENTER_RATIO;
  const ringWidth = (radius - inner) / Math.max(1, ringCount);
  const shown = new Map<string, string>();
  const result: SunburstLabel[] = [];

  for (const label of labels) {
    const midRadius = inner + (label.depth - 0.5) * ringWidth;
    const arcLength = (label.x1 - label.x0) * 2 * Math.PI * midRadius;
    const textWidth = label.name.length * LABEL_FONT_SIZE * GLYPH_WIDTH;
    if (arcLength < LABEL_FONT_SIZE + 2 || textWidth > ringWidth - 8) continue;

    const parentId = label.id.slice(0, label.id.lastIndexOf('/'));
    if (shown.get(parentId) === label.name) continue;

    shown.set(label.id, label.name);
    result.push(label);
  }
  return result;
}

/** Rotates a label along its radius, flipping the left half to stay upright. */
function radialRotation(label: SunburstLabel) {
  const degrees = ((label.x0 + label.x1) / 2) * 360;
  return degrees < 180 ? degrees - 90 : degrees + 90;
}

export const Sunburst = memo(function Sunburst(props: {
  data: SunburstData;
  sortByVersion: boolean;
  selectedVersion: string | null;
  onVersionChange: (version: string | null, isAggregated?: boolean) => void;
}) {
  const { theme } = useTheme();
  const { data, sortByVersion, selectedVersion, onVersionChange } = props;

  const rows = useMemo(() => flattenSunburst(data), [data]);
  const rowsById = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows]
  );
  const rootId = findDrillRootId(rows, selectedVersion);
  const root = rowsById.get(rootId)!;
  const parent = root.parentId ? rowsById.get(root.parentId) : undefined;

  const renderer = useMemo(() => motion<Node, number, number>(), []);

  const definition = useMemo(() => {
    const palette = generateThemeColorPalette(data.children.length + 1, theme);
    const branchColor = new Map(
      data.children.map((child, i) => [child.name, palette[i]])
    );
    const total = rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
    const sort = sunburstComparator(sortByVersion);
    const { labels, ringCount } = layoutSunburstLabels(
      rows,
      rootId,
      sort,
      VISIBLE_DEPTH
    );

    return defineChart({
      chart: ({ width, height }) => ({
        marks: [
          polar({
            radiusRatio: RADIUS_RATIO,
            marks: [
              sunburst(rows, {
                id: 'version-sunburst',
                nodeId: 'id',
                parentId: 'parentId',
                value: 'value',
                rootId,
                visibleDepth: VISIBLE_DEPTH,
                sort,
                innerRadius: ({ radius }) => radius * CENTER_RATIO,
                ringPadding: 1,
                fill: (node) =>
                  withAlpha(
                    branchColor.get(node.data?.branch ?? '') ?? palette[0],
                    node.data?.hasChildren ? 0.6 : 0.4
                  ),
                stroke: 'var(--bg-primary)',
                strokeWidth: 1,
              }),
            ],
            scales: { angle: null, radius: null },
          }),
          decorative(
            polar({
              id: 'version-sunburst-labels',
              radiusRatio: RADIUS_RATIO,
              motion: ({ phase }) =>
                phase === 'enter'
                  ? {
                      delay: LABEL_ENTER_DELAY,
                      transition: { type: 'tween', duration: 250 },
                    }
                  : phase === 'exit'
                  ? { transition: { type: 'tween', duration: 150 } }
                  : undefined,
              marks: [
                radialText(
                  fittingLabels(
                    labels,
                    ringCount,
                    (Math.min(width, height) / 2) * RADIUS_RATIO
                  ),
                  {
                    // Keyed by drill root so a drill cross-fades labels rather
                    // than spinning them along a chord.
                    key: (label) => `${rootId}:${label.id}`,
                    className: styles.label,
                    angle: (label) => (label.x0 + label.x1) / 2,
                    radius: (label) => label.depth - 0.5,
                    text: 'name',
                    rotate: radialRotation,
                    fill: 'currentColor',
                    fontSize: LABEL_FONT_SIZE,
                  }
                ),
              ],
              scales: {
                angle: { scale: scaleLinear().domain([0, 1]) },
                radius: {
                  scale: scaleLinear().domain([0, Math.max(1, ringCount)]),
                  range: [
                    ({ radius }) => radius * CENTER_RATIO,
                    ({ radius }) => radius,
                  ],
                },
              },
            })
          ),
        ],
        scales: { x: null, y: null },
        margin: 0,
      }),
      keyboard: true,
      focusRing: false,
      motion: {
        transition: {
          type: 'tween',
          duration: DRILL_DURATION,
          easing: 'ease-in-out',
        },
      },
      tooltip: {
        use: tooltip,
        content: (points: readonly ChartPoint<Node, number, number>[]) => {
          const point = points[0];
          return {
            title: point.datum.data?.name ?? point.datum.name,
            color: point.color,
            rows: [
              {
                label: 'Downloads',
                value: downloadFormat.format(point.datum.value),
              },
              {
                label: 'Share',
                value: `${
                  total > 0
                    ? ((point.datum.value / total) * 100).toFixed(2)
                    : '0'
                }%`,
              },
            ],
          };
        },
      },
    });
  }, [rows, rootId, sortByVersion, data.children, theme]);

  const handleSelect = (point: ChartPoint<Node, number, number> | null) => {
    const row = point?.datum.data;
    if (row && (row.hasChildren || row.isAggregated)) {
      onVersionChange(row.name, row.isAggregated);
    }
  };

  const goUp = () => {
    if (!parent) return;
    onVersionChange(parent.parentId === null ? null : parent.name);
  };

  // The focused sector is highlighted with one scoped rule on the library's
  // stable `data-ts-key`, so hover never rebuilds the chart.
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const focusRule = focusedKey
    ? `.${styles.chart} [data-ts-key=${JSON.stringify(
        focusedKey
      )}] { filter: var(--sunburst-focus-filter); }`
    : '';

  const centerStyle = {
    '--center-size': `${RADIUS_RATIO * CENTER_RATIO * 100}%`,
  } as CSSProperties;

  return (
    <div className={styles.chartContainer} style={centerStyle}>
      <style>{focusRule}</style>
      <Chart
        definition={definition}
        renderer={renderer}
        className={styles.chart}
        aspectRatio={1}
        initialWidth={480}
        ariaLabel="Downloads by version"
        ariaDescription="Use arrow keys to inspect versions and Enter or Space to drill into a version range. Use the center button to move up."
        onSelect={handleSelect}
        onFocusChange={(point) => setFocusedKey(point?.key ?? null)}
      />
      <button
        type="button"
        className={styles.center}
        disabled={!parent}
        onClick={goUp}
        aria-label={parent ? `Back to ${parent.name}` : 'All versions'}
      >
        <span className={styles.centerName}>
          {parent ? root.name : 'All versions'}
        </span>
        {parent ? (
          <span className={styles.centerHint}>↑ {parent.name}</span>
        ) : null}
      </button>
    </div>
  );
});
