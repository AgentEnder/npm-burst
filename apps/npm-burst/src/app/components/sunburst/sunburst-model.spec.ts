import { defineChart } from '@tanstack/charts';
import { sunburst } from '@tanstack/charts/hierarchy/sunburst';
import { polar, radialText } from '@tanstack/charts/polar';
import { createChartScene } from '@tanstack/charts/scene';
import { scaleLinear } from 'd3-scale';
import {
  findDrillRootId,
  flattenSunburst,
  layoutSunburstLabels,
  sunburstComparator,
} from './sunburst-model';
import type { SunburstData } from './sunburst-model';

const tree: SunburstData = {
  name: 'versions',
  children: [
    {
      name: 'v1',
      children: [
        {
          name: 'v1.2',
          children: [
            {
              name: 'v1.2.3',
              children: [
                { name: 'v1.2.3', value: 10 },
                { name: 'v1.2.3-beta.1', value: 2 },
              ],
            },
          ],
        },
        { name: 'v1.?', value: 3, isAggregated: true },
      ],
    },
    { name: 'Other', value: 1, isAggregated: true },
  ],
};

describe('flattenSunburst', () => {
  it('gives every node a unique path id even when names repeat', () => {
    const rows = flattenSunburst(tree);
    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('versions/v1/v1.2/v1.2.3');
    expect(ids).toContain('versions/v1/v1.2/v1.2.3/v1.2.3');
  });

  it('keeps leaf values and leaves internal nodes for the chart to sum', () => {
    const rows = flattenSunburst(tree);
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get('versions/v1')?.value).toBeNull();
    expect(byId.get('versions/v1/v1.?')).toMatchObject({
      value: 3,
      isAggregated: true,
      hasChildren: false,
    });
  });

  it('tags each node with its top-level branch', () => {
    const rows = flattenSunburst(tree);
    const leaf = rows.find((row) => row.name === 'v1.2.3-beta.1');
    expect(leaf?.branch).toBe('v1');
    expect(rows.find((row) => row.name === 'Other')?.branch).toBe('Other');
  });
});

describe('findDrillRootId', () => {
  const rows = flattenSunburst(tree);

  it('uses the hierarchy root when nothing is selected', () => {
    expect(findDrillRootId(rows, null)).toBe('versions');
  });

  it('drills to the first depth-first match, preferring the group', () => {
    expect(findDrillRootId(rows, 'v1.2.3')).toBe('versions/v1/v1.2/v1.2.3');
  });

  it('drills to the parent of a selected leaf', () => {
    expect(findDrillRootId(rows, 'v1.?')).toBe('versions/v1');
  });

  it('falls back to the root for unknown names', () => {
    expect(findDrillRootId(rows, 'v9')).toBe('versions');
  });
});

describe('layoutSunburstLabels', () => {
  const SIZE = 480;
  const CENTER_RATIO = 1 / 3;

  // Minors are in neither version nor value order, so both sorts must act.
  const wide: SunburstData = {
    name: 'versions',
    children: [
      {
        name: 'v3',
        children: [
          { name: 'v3.0', children: [{ name: 'v3.0.0', value: 25 }] },
          { name: 'v3.2', children: [{ name: 'v3.2.0', value: 5 }] },
          { name: 'v3.1', children: [{ name: 'v3.1.0', value: 12 }] },
        ],
      },
      {
        name: 'v2',
        children: [
          { name: 'v2.0', children: [{ name: 'v2.0.0', value: 40 }] },
          { name: 'v2.?', value: 4, isAggregated: true },
        ],
      },
      { name: 'Other', value: 6, isAggregated: true },
    ],
  };

  /** Pixel centers of the library's sectors and of our labels, by node id. */
  function centers(rootId: string, sortByVersion: boolean) {
    const rows = flattenSunburst(wide);
    const sort = sunburstComparator(sortByVersion);
    const { labels, ringCount } = layoutSunburstLabels(rows, rootId, sort, 2);
    const scene = createChartScene(
      defineChart({
        marks: [
          polar({
            marks: [
              sunburst(rows, {
                nodeId: 'id',
                parentId: 'parentId',
                value: 'value',
                rootId,
                visibleDepth: 2,
                sort,
                innerRadius: ({ radius }) => radius * CENTER_RATIO,
              }),
            ],
            scales: { angle: null, radius: null },
          }),
          polar({
            marks: [
              radialText(labels, {
                angle: (label) => (label.x0 + label.x1) / 2,
                radius: (label) => label.depth - 0.5,
                text: 'name',
              }),
            ],
            scales: {
              angle: { scale: scaleLinear().domain([0, 1]) },
              radius: {
                scale: scaleLinear().domain([0, ringCount]),
                range: [
                  ({ radius }) => radius * CENTER_RATIO,
                  ({ radius }) => radius,
                ],
              },
            },
          }),
        ],
        scales: { x: null, y: null },
        margin: 0,
      }),
      { width: SIZE, height: SIZE }
    );

    const sectors = new Map<string, { x: number; y: number }>();
    const labelPoints = new Map<string, { x: number; y: number }>();
    for (const point of scene.points) {
      const datum = point.datum as { id: string; x0?: number };
      (datum.x0 === undefined ? sectors : labelPoints).set(datum.id, point);
    }
    return { sectors, labelPoints };
  }

  it.each([
    ['versions', false],
    ['versions', true],
    ['versions/v3', false],
    ['versions/v2', true],
  ])(
    'places a label on every sector center (root %s, version sort %s)',
    (rootId, byVersion) => {
      const { sectors, labelPoints } = centers(rootId, byVersion);
      expect(labelPoints.size).toBe(sectors.size);
      for (const [id, sector] of sectors) {
        const label = labelPoints.get(id);
        expect(label, id).toBeDefined();
        expect(label!.x).toBeCloseTo(sector.x, 6);
        expect(label!.y).toBeCloseTo(sector.y, 6);
      }
    }
  );

  it.each([
    [true, ['v3.2', 'v3.1', 'v3.0']],
    [false, ['v3.0', 'v3.1', 'v3.2']],
  ])('orders the chart sectors (version sort %s)', (byVersion, expected) => {
    const { sectors } = centers('versions/v3', byVersion);
    const clockwise = (p: { x: number; y: number }) =>
      (Math.atan2(p.x - SIZE / 2, SIZE / 2 - p.y) + 2 * Math.PI) %
      (2 * Math.PI);
    const order = [...sectors]
      .filter(([id]) => /^versions\/v3\/v3\.\d$/.test(id))
      .sort(([, a], [, b]) => clockwise(a) - clockwise(b))
      .map(([id]) => id.split('/').pop());
    expect(order).toEqual(expected);
  });
});
