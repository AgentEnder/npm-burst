/**
 * Everything a breakdown card draws, computed from one snapshot and the view
 * state in the page's query string.
 *
 * The chart is laid out with the same pipeline the page uses: the same tree
 * builder, comparator, drill-root rule and palette. A card shared from
 * `?selectedVersion=v21&lpf=5.00` therefore shows the partition the sender was
 * looking at, not an approximation of it.
 *
 * Pure: no fonts, no wasm, no I/O.
 */

import { partition, stratify } from 'd3-hierarchy';
import { arc } from 'd3-shape';

import {
  findDrillRootId,
  flattenSunburst,
  sunburstComparator,
  type SunburstRow,
} from '../app/components/sunburst/sunburst-model';
import { getSunburstDataFromDownloads } from '../app/utils/chart-data';
import { summarizeSnapshot } from '../app/utils/package-seo';
import { generateThemeColorPalette } from '../app/utils/theme-colors';

/** Dark theme `--bg-primary`. Arcs are blended onto it, as on the page. */
export const CARD_BACKGROUND = '#0d1117';

/** Same proportions as the page chart. */
const CENTER_RATIO = 1 / 3;
const VISIBLE_DEPTH = 2;
const RING_PADDING = 1;

/** Legend rows that fit beside the chart. The rest are counted, not listed. */
const MAX_LEGEND = 5;

/** The query-string view state that changes what the breakdown chart shows. */
export interface BreakdownView {
  lowPassFilter: number;
  expandedNodes: string[];
  versionFilter: string;
  sortByVersion: boolean;
  selectedVersion: string | null;
}

export interface CardArc {
  key: string;
  path: string;
  fill: string;
}

export interface LegendEntry {
  name: string;
  color: string;
  /** Share of the drill root's downloads, 0-1. */
  share: number;
}

export interface BreakdownCard {
  packageName: string;
  totalDownloads: number;
  versionCount: number;
  /** Null when the chart shows all versions. */
  drillRoot: { name: string; share: number } | null;
  versionFilter: string;
  radius: number;
  arcs: CardArc[];
  legend: LegendEntry[];
  /** Ring-1 sectors not listed in `legend`. */
  legendOverflow: number;
}

/**
 * Composite `color` at `alpha` over the card background.
 *
 * The page draws translucent fills over `--bg-primary`. The card bakes the
 * result into a solid colour so the rasteriser has nothing to blend.
 */
function blend(color: string, alpha: number): string {
  const channel = (hex: string, i: number) =>
    parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mixed = [0, 1, 2].map((i) =>
    Math.round(
      channel(color, i) * alpha + channel(CARD_BACKGROUND, i) * (1 - alpha)
    )
  );
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function buildBreakdownCard(
  packageName: string,
  downloads: Record<string, number>,
  view: BreakdownView,
  radius: number
): BreakdownCard | null {
  const summary = summarizeSnapshot(downloads);
  if (!summary) return null;

  const tree = getSunburstDataFromDownloads(
    { package: packageName, downloads },
    view.lowPassFilter,
    view.expandedNodes,
    view.versionFilter
  );
  const rows = flattenSunburst(tree);
  const rootId = findDrillRootId(rows, view.selectedVersion);
  const compare = sunburstComparator(view.sortByVersion);

  const hierarchy = stratify<SunburstRow>()
    .id((row) => row.id)
    .parentId((row) => row.parentId)(rows)
    .sum((row) => row.value ?? 0)
    .sort((a, b) =>
      compare(
        { value: a.value ?? 0, data: a.data },
        { value: b.value ?? 0, data: b.data }
      )
    );

  const selected =
    hierarchy.descendants().find((node) => node.data.id === rootId) ??
    hierarchy;
  const layout = partition<SunburstRow>().size([2 * Math.PI, 1])(
    selected.copy()
  );

  const palette = generateThemeColorPalette(tree.children.length + 1, 'dark');
  const branchColor = new Map(
    tree.children.map((child, i) => [child.name, palette[i]])
  );
  // Translucent on the page, so the legend swatch must use the blended fill
  // too or it will not match its arc.
  const fillOf = (row: SunburstRow) =>
    blend(
      branchColor.get(row.branch) ?? palette[0],
      row.hasChildren ? 0.6 : 0.4
    );

  const ringCount = Math.max(1, Math.min(layout.height, VISIBLE_DEPTH));
  const inner = radius * CENTER_RATIO;
  const ringWidth = (radius - inner) / ringCount;
  const drawArc = arc();

  const arcs = layout
    .descendants()
    .filter(
      (node) => node.depth > 0 && node.depth <= ringCount && node.x1 > node.x0
    )
    .map((node) => ({
      key: node.data.id,
      path:
        drawArc({
          innerRadius: inner + (node.depth - 1) * ringWidth + RING_PADDING,
          outerRadius: inner + node.depth * ringWidth,
          startAngle: node.x0,
          endAngle: node.x1,
        }) ?? '',
      fill: fillOf(node.data),
    }));

  const ring = layout.children ?? [];
  const rootValue = layout.value ?? 0;
  const legend = ring.slice(0, MAX_LEGEND).map((node) => ({
    name: node.data.name,
    color: fillOf(node.data),
    share: rootValue > 0 ? (node.value ?? 0) / rootValue : 0,
  }));

  const totalValue = hierarchy.value ?? 0;

  return {
    packageName,
    totalDownloads: summary.totalDownloads,
    versionCount: summary.versionCount,
    drillRoot:
      selected === hierarchy
        ? null
        : {
            name: selected.data.name,
            share: totalValue > 0 ? (selected.value ?? 0) / totalValue : 0,
          },
    versionFilter: view.versionFilter.trim(),
    radius,
    arcs,
    legend,
    legendOverflow: Math.max(0, ring.length - MAX_LEGEND),
  };
}
