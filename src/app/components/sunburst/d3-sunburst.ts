/* eslint-disable @typescript-eslint/no-explicit-any -- d3 typings are not great.*/
import * as d3 from 'd3';
import { HierarchyNode, HierarchyRectangularNode } from 'd3';

export type SunburstData = {
  name: string;
  children: (SunburstData | SunburstLeafNode)[];
};

export type SunburstLeafNode = {
  name: string;
  value: number;
};

const width = 450;
const height = width * 0.75;
const radius = 50;

const arc = d3
  .arc<HierarchyRectangularNode<any>>()
  .startAngle((d) => d.x0)
  .endAngle((d) => d.x1)
  .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005))
  .padRadius(radius * 1.5)
  .innerRadius((d) => d.y0 * radius)
  .outerRadius((d) => Math.max(d.y0 * radius, d.y1 * radius - 1));

const format = d3.format(',d');

export function isLeafNode(
  datum: SunburstData | SunburstLeafNode
): datum is SunburstLeafNode {
  return 'value' in datum;
}

function partition(
  data: SunburstData,
  comparator: (
    a: HierarchyNode<SunburstData>,
    b: HierarchyNode<SunburstData>
  ) => number = (a, b) => b.value! - a.value!
) {
  const root = d3
    .hierarchy(data)
    .sum((d) => (isLeafNode(d) ? d.value : 0))
    .sort(comparator);
  return d3.partition<SunburstData>().size([2 * Math.PI, root.height + 1])(
    root
  );
}

export interface D3SunburstOptions {
  data: SunburstData;
  sortComparator?: (
    a: HierarchyNode<SunburstData>,
    b: HierarchyNode<SunburstData>
  ) => number;
  selectionUpdated?: (selection: string) => void;
  versionMouseEnter?: (selection: string) => void;
  versionMouseExit?: (selection: string) => void;
}

export function sunburst({
  data,
  sortComparator = (a, b) => b.value! - a.value!,
  selectionUpdated,
  versionMouseEnter,
  versionMouseExit,
}: {
  data: SunburstData;
  sortComparator?: (
    a: HierarchyNode<SunburstData>,
    b: HierarchyNode<SunburstData>
  ) => number;
  selectionUpdated?: (selection: string) => void;
  versionMouseEnter?: (selection: string) => void;
  versionMouseExit?: (selection: string) => void;
}): SVGSVGElement {
  const color = d3.scaleOrdinal(
    d3.quantize(d3.interpolateRainbow, data.children.length + 1)
  );

  const root = partition(
    data,
    sortComparator
  ) as d3.HierarchyRectangularNode<SunburstData> & {
    current: d3.HierarchyRectangularNode<SunburstData>;
  };

  root.each((d) => (d.current = d));

  const svg = d3
    .create('svg')
    .attr('viewBox', [0, 0, width, height])
    .attr('width', 'min(1020px, 75vw)')
    .style('font', '5px sans-serif');

  const g = svg
    .append('g')
    .attr('transform', `translate(${width / 2},${height / 2})`);

  const path = g
    .append('g')
    .selectAll('path')
    .data(root.descendants().slice(1))
    .join('path')
    .attr('fill', (d) => {
      while (d.depth > 1) d = d.parent!;
      return color(d.data.name);
    })
    .attr('fill-opacity', (d) =>
      arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0
    )
    .attr('pointer-events', (d) => (arcVisible(d.current) ? 'auto' : 'none'))
    .attr('data-name', (d) => d.data.name)

    .attr('d', (d) => arc(d.current!))
    .on('mouseenter', mouseEnter)
    .on('mouseleave', mouseExit);

  path
    .filter((d) => !!d.children)
    .style('cursor', 'pointer')
    .on('click', clicked);

  path.append('title').text(
    (d) =>
      `${d
        .ancestors()
        .map((d) => d.data.name)
        .reverse()
        .join('/')}\n${format(d.value!)}`
  );

  const label = g
    .append('g')
    .attr('pointer-events', 'none')
    .attr('text-anchor', 'middle')
    .style('user-select', 'none')
    .selectAll('text')
    .data(root.descendants().slice(1))
    .join('text')
    .attr('dy', '0.35em')
    .attr('fill-opacity', (d) => +labelVisible(d.current))
    .attr('transform', (d) => labelTransform(d.current))
    .text((d) => d.data.name);

  const parent = g
    .append('circle')
    .datum(root)
    .attr('r', radius - 1)
    .attr('fill', '#afaffa')
    .attr('pointer-events', 'all')
    .attr('id', 'innerCircle')
    .on('click', clicked)
    .on('mouseenter', mouseEnter)
    .on('mouseleave', mouseExit);

  function mouseEnter(
    event: Event,
    p: d3.HierarchyRectangularNode<SunburstData>
  ) {
    const child = d3.select('#innerCircle');
    child.attr('fill', '#cfcfff');
    versionMouseEnter?.(p.data.name);
    console.log(p.data.name);
  }
  function mouseExit(
    event: Event,
    p: d3.HierarchyRectangularNode<SunburstData>
  ) {
    const child = d3.select('#innerCircle');
    child.attr('fill', '#afaffa');
    versionMouseExit?.(p.data.name);
  }

  function clicked(event: Event, p: d3.HierarchyRectangularNode<SunburstData>) {
    selectionUpdated?.(p.data.name);
    parent.datum(p.parent || root);

    root.each(
      (d: any) =>
        (d.target = {
          x0:
            Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) *
            2 *
            Math.PI,
          x1:
            Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) *
            2 *
            Math.PI,
          y0: Math.max(0, d.y0 - p.depth),
          y1: Math.max(0, d.y1 - p.depth),
        })
    );

    const t = g.transition().duration(750);

    // Transition the data on all arcs, even the ones that aren’t visible,
    // so that if this transition is interrupted, entering arcs will start
    // the next transition from the desired position.
    path
      .transition(t as any)
      .tween('data', (d: any) => {
        const i = d3.interpolate(d.current, d.target);
        return (t: any) => (d.current = i(t));
      })
      .filter(function (d: any) {
        return (
          !!+(this as SVGElement).getAttribute('fill-opacity')! ||
          arcVisible(d.target as any)
        );
      })
      .attr('fill-opacity', (d: any) =>
        arcVisible(d.target) ? (d.children ? 0.6 : 0.4) : 0
      )
      .attr('pointer-events', (d: any) =>
        arcVisible(d.target) ? 'auto' : 'none'
      )

      .attrTween('d', (d: any) => () => arc(d.current!) as any);

    label
      .filter(function (d: any) {
        return (
          !!+(this as SVGElement).getAttribute('fill-opacity')! ||
          labelVisible(d.target)
        );
      })
      .transition(t as any)
      .attr('fill-opacity', (d: any) => +labelVisible(d.target))
      .attrTween('transform', (d) => () => labelTransform(d.current));
  }

  function arcVisible(d: any) {
    return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
  }

  function labelVisible(d: any) {
    return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
  }

  function labelTransform(d: any) {
    const x = (((d.x0 + d.x1) / 2) * 180) / Math.PI;
    const y = ((d.y0 + d.y1) / 2) * radius;
    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
  }

  return svg.node() as SVGSVGElement;
}
