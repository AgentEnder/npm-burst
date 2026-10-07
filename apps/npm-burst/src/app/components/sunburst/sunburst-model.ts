import { partition, stratify } from 'd3-hierarchy';
import { coerce, gt } from 'semver';

export type SunburstData = {
  name: string;
  children: (SunburstData | SunburstLeafNode)[];
};

export type SunburstLeafNode = {
  name: string;
  value: number;
  isAggregated?: boolean;
};

export function isLeafNode(
  datum: SunburstData | SunburstLeafNode
): datum is SunburstLeafNode {
  return 'value' in datum;
}

export function isAggregatedNode(
  datum: SunburstData | SunburstLeafNode
): datum is SunburstLeafNode & { isAggregated: true } {
  return isLeafNode(datum) && !!datum.isAggregated;
}

/**
 * One flat row per tree node.
 *
 * Version names repeat across depths (`v1.2.3` is both a patch group and its
 * untagged release), so `id` is the slash-joined path of names from the root.
 */
export interface SunburstRow {
  id: string;
  parentId: string | null;
  name: string;
  /** Leaf download count. Internal nodes are summed by the chart. */
  value: number | null;
  isAggregated: boolean;
  hasChildren: boolean;
  /** Name of the top-level ancestor, used to pick the branch color. */
  branch: string;
}

export function flattenSunburst(data: SunburstData): SunburstRow[] {
  const rows: SunburstRow[] = [];

  const visit = (
    node: SunburstData | SunburstLeafNode,
    parentId: string | null,
    branch: string
  ) => {
    const id = parentId === null ? node.name : `${parentId}/${node.name}`;
    const leaf = isLeafNode(node);
    rows.push({
      id,
      parentId,
      name: node.name,
      value: leaf ? node.value : null,
      isAggregated: isAggregatedNode(node),
      hasChildren: !leaf && node.children.length > 0,
      branch,
    });
    if (!leaf) {
      for (const child of node.children) {
        visit(child, id, parentId === null ? child.name : branch);
      }
    }
  };

  visit(data, null, data.name);
  return rows;
}

/**
 * Resolves the drill root for a selected version name.
 *
 * Matches the first node in depth-first order, the same rule as
 * `findNodeByVersion`. A selected leaf drills to its parent so it stays
 * visible.
 */
export function findDrillRootId(
  rows: readonly SunburstRow[],
  selectedName: string | null
): string {
  const rootId = rows[0].id;
  if (selectedName === null) return rootId;
  const match = rows.find((row) => row.name === selectedName);
  if (!match) return rootId;
  return match.hasChildren ? match.id : match.parentId ?? rootId;
}

/**
 * The fields sibling ordering reads. `SunburstNode<SunburstRow>` satisfies it.
 *
 * In parent mode the chart's node `name` is the full path id, so version
 * comparisons read the row name from `data`.
 */
export interface SortableSunburstNode {
  value: number;
  data: SunburstRow | null;
}

export type SunburstComparator = (
  a: SortableSunburstNode,
  b: SortableSunburstNode
) => number;

function compareByValue(a: SortableSunburstNode, b: SortableSunburstNode) {
  return b.value - a.value;
}

function compareByVersion(a: SortableSunburstNode, b: SortableSunburstNode) {
  const vA = coerce(a.data?.name);
  const vB = coerce(b.data?.name);
  if (!vA || !vB) return compareByValue(a, b);
  return gt(vA, vB) ? -1 : 1;
}

/** Orders siblings by version or by downloads, with "Other" buckets last. */
export function sunburstComparator(sortByVersion: boolean): SunburstComparator {
  const compare = sortByVersion ? compareByVersion : compareByValue;
  return (a, b) => {
    const aAggregated = !!a.data?.isAggregated;
    const bAggregated = !!b.data?.isAggregated;
    if (aAggregated !== bAggregated) return aAggregated ? 1 : -1;
    if (aAggregated) return 0;
    return compare(a, b);
  };
}

export interface SunburstLabel {
  id: string;
  name: string;
  /** Ring index below the drill root, starting at 1. */
  depth: number;
  /** Angular extent as a fraction of the full sweep. */
  x0: number;
  x1: number;
}

/**
 * Lays out label positions for the visible rings.
 *
 * Mirrors the `sunburst` mark: sum leaf values, sort siblings, re-root at
 * `rootId`, then partition the sweep into `[0, 1]`. Rings are equal width, so
 * `depth - 0.5` on a `[0, ringCount]` radius scale is the ring's center.
 */
export function layoutSunburstLabels(
  rows: readonly SunburstRow[],
  rootId: string,
  compare: SunburstComparator,
  visibleDepth: number
): { labels: SunburstLabel[]; ringCount: number } {
  const hierarchy = stratify<SunburstRow>()
    .id((row) => row.id)
    .parentId((row) => row.parentId)(Array.from(rows))
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
  const layoutRoot = partition<SunburstRow>().size([
    1,
    Math.max(1, selected.height + 1),
  ])(selected.copy());

  const labels = layoutRoot
    .descendants()
    .slice(1)
    .filter((node) => node.depth <= visibleDepth && node.x1 > node.x0)
    .map((node) => ({
      id: node.data.id,
      name: node.data.name,
      depth: node.depth,
      x0: node.x0,
      x1: node.x1,
    }));

  return {
    labels,
    ringCount: Math.min(layoutRoot.height, visibleDepth),
  };
}
