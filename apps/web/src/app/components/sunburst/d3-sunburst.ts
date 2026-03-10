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
  isAggregated?: boolean;
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

export function isAggregatedNode(
  datum: SunburstData | SunburstLeafNode
): datum is SunburstLeafNode & { isAggregated: true } {
  return isLeafNode(datum) && !!datum.isAggregated;
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
  selectionUpdated?: (selection: string, isAggregated?: boolean) => void;
  colors?: {
    palette: string[];
    centerFill: string;
    centerHover: string;
    labelColor: string;
  };
}

export function sunburst({
  data,
  sortComparator = (a, b) => b.value! - a.value!,
  selectionUpdated,
  colors,
}: {
  data: SunburstData;
  sortComparator?: (
    a: HierarchyNode<SunburstData>,
    b: HierarchyNode<SunburstData>
  ) => number;
  selectionUpdated?: (selection: string, isAggregated?: boolean) => void;
  colors?: {
    palette: string[];
    centerFill: string;
    centerHover: string;
    labelColor: string;
  };
}): SVGSVGElement {
  // Use provided color palette or fallback to rainbow
  const colorPalette =
    colors?.palette ||
    d3.quantize(d3.interpolateRainbow, data.children.length + 1);
  const color = d3.scaleOrdinal(colorPalette);

  const root = partition(
    data,
    sortComparator
  ) as d3.HierarchyRectangularNode<SunburstData> & {
    current: d3.HierarchyRectangularNode<SunburstData>;
  };

  root.each((d) => (d.current = d));

  // Calculate total for percentage calculations
  const totalValue = root.value || 0;

  const svg = d3
    .create('svg')
    .attr('viewBox', [0, 0, width, height])
    .attr('width', 'min(1020px, 75vw)')
    .style('font', '5px sans-serif')
    .style('position', 'relative');

  const g = svg
    .append('g')
    .attr('transform', `translate(${width / 2},${height / 2})`);

  // Create tooltip group
  const tooltipGroup = svg
    .append('g')
    .attr('class', 'sunburst-tooltip')
    .style('pointer-events', 'none')
    .style('opacity', '0')
    .style('transition', 'opacity 150ms ease-in-out');

  // Tooltip background
  const tooltipBg = tooltipGroup
    .append('rect')
    .attr('rx', 8)
    .attr('ry', 8)
    .attr('fill', colors?.centerFill || '#2d2d2d')
    .attr('stroke', colors?.labelColor || 'rgba(255, 255, 255, 0.12)')
    .attr('stroke-width', 1)
    .style('filter', 'drop-shadow(0 6px 10px rgba(0, 0, 0, 0.3))');

  // Tooltip text elements
  const tooltipTitle = tooltipGroup
    .append('text')
    .attr('class', 'tooltip-title')
    .attr('fill', colors?.labelColor || '#fff')
    .attr('font-size', '11px')
    .attr('font-weight', '600');

  const tooltipDownloads = tooltipGroup
    .append('text')
    .attr('class', 'tooltip-downloads')
    .attr('fill', colors?.labelColor || 'rgba(255, 255, 255, 0.7)')
    .attr('font-size', '10px');

  const tooltipPercentage = tooltipGroup
    .append('text')
    .attr('class', 'tooltip-percentage')
    .attr('fill', colors?.labelColor || 'rgba(255, 255, 255, 0.7)')
    .attr('font-size', '10px');

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

    .attr('d', (d) => arc(d.current!));

  // Add hover handlers for tooltip
  path
    .on('mouseenter', function (event, d) {
      // Highlight effect - increase opacity (instant, no transition)
      const currentOpacity = d3.select(this).attr('fill-opacity');
      if (currentOpacity && parseFloat(currentOpacity) > 0) {
        d3.select(this).attr(
          'fill-opacity',
          Math.min(1, parseFloat(currentOpacity) * 1.3)
        );
      }

      // Show and update tooltip
      const percentage =
        totalValue > 0 ? ((d.value! / totalValue) * 100).toFixed(2) : '0';

      tooltipTitle.text(d.data.name);
      tooltipDownloads.text(`${format(d.value!)}`);
      tooltipPercentage.text(`${percentage}%`);

      // Calculate tooltip dimensions
      const titleBBox = (tooltipTitle.node() as SVGTextElement).getBBox();
      const downloadsBBox = (
        tooltipDownloads.node() as SVGTextElement
      ).getBBox();
      const percentageBBox = (
        tooltipPercentage.node() as SVGTextElement
      ).getBBox();

      const padding = 8;
      const tooltipWidth =
        Math.max(titleBBox.width, downloadsBBox.width, percentageBBox.width) +
        padding * 2;
      const tooltipHeight = 52;

      // Position text elements
      tooltipTitle.attr('x', padding).attr('y', padding + 10);
      tooltipDownloads.attr('x', padding).attr('y', padding + 26);
      tooltipPercentage.attr('x', padding).attr('y', padding + 40);

      // Update background
      tooltipBg.attr('width', tooltipWidth).attr('height', tooltipHeight);

      // Position tooltip based on which corner is closest to center
      const [mouseX, mouseY] = d3.pointer(event, svg.node());
      const centerX = width / 2;
      const centerY = height / 2;

      // Determine which corner of the tooltip should be near the mouse
      // Position tooltip so it extends towards the center
      const gap = 8;
      let offsetX = gap;
      let offsetY = gap;

      if (mouseX > centerX) {
        // Mouse is on right side, tooltip extends left
        offsetX = -(tooltipWidth + gap);
      }

      if (mouseY > centerY) {
        // Mouse is on bottom, tooltip extends up
        offsetY = -(tooltipHeight + gap);
      }

      tooltipGroup
        .attr(
          'transform',
          `translate(${mouseX + offsetX}, ${mouseY + offsetY})`
        )
        .style('opacity', '1');
    })
    .on('mousemove', function (event) {
      // Update tooltip position on mouse move
      const [mouseX, mouseY] = d3.pointer(event, svg.node());
      const centerX = width / 2;
      const centerY = height / 2;

      const tooltipWidth = parseFloat(tooltipBg.attr('width'));
      const tooltipHeight = parseFloat(tooltipBg.attr('height'));

      const gap = 8;
      let offsetX = gap;
      let offsetY = gap;

      if (mouseX > centerX) {
        offsetX = -(tooltipWidth + gap);
      }

      if (mouseY > centerY) {
        offsetY = -(tooltipHeight + gap);
      }

      tooltipGroup.attr(
        'transform',
        `translate(${mouseX + offsetX}, ${mouseY + offsetY})`
      );
    })
    .on('mouseleave', function (_event, d) {
      // Reset opacity to correct value based on visibility (instant, no transition)
      d3.select(this).attr(
        'fill-opacity',
        arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0
      );

      // Hide tooltip
      tooltipGroup.style('opacity', '0');
    });

  // Allow clicking on nodes with children or aggregated leaf nodes
  path
    .filter((d) => !!d.children || isAggregatedNode(d.data))
    .style('cursor', 'pointer')
    .on('click', clicked);

  const label = g
    .append('g')
    .attr('pointer-events', 'none')
    .attr('text-anchor', 'middle')
    .style('user-select', 'none')
    .selectAll('text')
    .data(root.descendants().slice(1))
    .join('text')
    .attr('dy', '0.35em')
    .attr('fill', colors?.labelColor || '#000')
    .attr('fill-opacity', (d) => {
      // Hide label if parent has same name and is also visible
      if (
        d.parent &&
        d.parent.data.name === d.data.name &&
        labelVisible(d.parent.current)
      ) {
        return 0;
      }
      return +labelVisible(d.current);
    })
    .attr('transform', (d) => labelTransform(d.current))
    .text((d) => d.data.name);

  const centerFill = colors?.centerFill || '#afaffa';
  const centerHover = colors?.centerHover || '#cfcfff';

  const parent = g
    .append('circle')
    .datum(root)
    .attr('r', radius - 1)
    .attr('fill', centerFill)
    .attr('pointer-events', 'all')
    .attr('id', 'innerCircle')
    .style('transition', 'fill 0.2s ease-in-out')
    .on('click', clicked)
    .on('mouseenter', mouseEnter)
    .on('mouseleave', mouseExit);

  function mouseEnter() {
    const child = d3.select('#innerCircle');
    child.attr('fill', centerHover);
  }
  function mouseExit() {
    const child = d3.select('#innerCircle');
    child.attr('fill', centerFill);
  }

  function clicked(
    _event: Event,
    p: d3.HierarchyRectangularNode<SunburstData>
  ) {
    selectionUpdated?.(p.data.name, isAggregatedNode(p.data));
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

    // Transition the data on all arcs, even the ones that aren't visible,
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
      .attr('fill-opacity', (d: any) => {
        // Hide label if parent has same name and is also visible
        if (
          d.parent &&
          d.parent.data.name === d.data.name &&
          labelVisible(d.parent.target)
        ) {
          return 0;
        }
        return +labelVisible(d.target);
      })
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
