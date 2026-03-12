/* eslint-disable @typescript-eslint/no-explicit-any -- d3 typings are not great.*/
import * as d3 from 'd3';
import { HierarchyNode, HierarchyRectangularNode } from 'd3';
import type { StoreApi } from 'zustand/vanilla';

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
  store?: StoreApi<{ sunburstChartData: SunburstData | null }>;
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
    tooltipBg?: string;
    tooltipBorder?: string;
    tooltipText?: string;
    tooltipTextSecondary?: string;
  };
}

export interface SunburstResult {
  svg: SVGSVGElement;
  unsubscribe: () => void;
}

export function sunburst({
  data,
  store,
  sortComparator = (a, b) => b.value! - a.value!,
  selectionUpdated,
  colors,
}: D3SunburstOptions): SunburstResult {
  // Use provided color palette or fallback to rainbow
  const colorPalette =
    colors?.palette ||
    d3.quantize(d3.interpolateRainbow, data.children.length + 1);
  const color = d3.scaleOrdinal(colorPalette);

  // Mutable root — replaced on each data update so clicked() uses current data
  let root = partition(
    data,
    sortComparator
  ) as d3.HierarchyRectangularNode<SunburstData> & {
    current: d3.HierarchyRectangularNode<SunburstData>;
  };

  root.each((d) => (d.current = d));

  // Calculate total for percentage calculations
  let totalValue = root.value || 0;

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
    .style('transition', 'opacity 150ms ease-out');

  // Tooltip background
  const tooltipBg = tooltipGroup
    .append('rect')
    .attr('rx', 10)
    .attr('ry', 10)
    .attr('fill', colors?.tooltipBg || '#242424')
    .attr('stroke', colors?.tooltipBorder || 'rgba(255, 255, 255, 0.12)')
    .attr('stroke-width', 0.5)
    .style('filter', 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4))');

  // Tooltip text elements
  const tooltipTitle = tooltipGroup
    .append('text')
    .attr('class', 'tooltip-title')
    .attr('fill', colors?.tooltipText || '#fff')
    .attr('font-size', '11px')
    .attr('font-weight', '600')
    .attr('font-family', 'Inter, system-ui, sans-serif');

  const tooltipDownloads = tooltipGroup
    .append('text')
    .attr('class', 'tooltip-downloads')
    .attr('fill', colors?.tooltipTextSecondary || 'rgba(255, 255, 255, 0.5)')
    .attr('font-size', '9.5px')
    .attr('font-family', 'Inter, system-ui, sans-serif');

  const tooltipPercentage = tooltipGroup
    .append('text')
    .attr('class', 'tooltip-percentage')
    .attr('fill', colors?.tooltipTextSecondary || 'rgba(255, 255, 255, 0.5)')
    .attr('font-size', '9.5px')
    .attr('font-family', 'Inter, system-ui, sans-serif');

  // Container groups for path and label — we use enter/update/exit joins
  const pathGroup = g.append('g');
  const labelGroup = g
    .append('g')
    .attr('pointer-events', 'none')
    .attr('text-anchor', 'middle')
    .style('user-select', 'none');

  let path: d3.Selection<any, any, any, any>;
  let label: d3.Selection<any, any, any, any>;

  function setupPathHandlers(sel: d3.Selection<any, any, any, any>) {
    sel
      .on('mouseenter', function (event: any, d: any) {
        const currentOpacity = d3.select(this).attr('fill-opacity');
        if (currentOpacity && parseFloat(currentOpacity) > 0) {
          d3.select(this).attr(
            'fill-opacity',
            Math.min(1, parseFloat(currentOpacity) * 1.3)
          );
        }

        const percentage =
          totalValue > 0 ? ((d.value! / totalValue) * 100).toFixed(2) : '0';

        tooltipTitle.text(d.data.name);
        tooltipDownloads.text(`${format(d.value!)}`);
        tooltipPercentage.text(`${percentage}%`);

        const titleBBox = (tooltipTitle.node() as SVGTextElement).getBBox();
        const downloadsBBox = (
          tooltipDownloads.node() as SVGTextElement
        ).getBBox();
        const percentageBBox = (
          tooltipPercentage.node() as SVGTextElement
        ).getBBox();

        const paddingX = 10;
        const paddingY = 9;
        const titleY = paddingY + 11;
        const downloadsY = titleY + 15;
        const percentageY = downloadsY + 13;
        const tooltipWidth =
          Math.max(
            titleBBox.width,
            downloadsBBox.width,
            percentageBBox.width
          ) +
          paddingX * 2;
        const tooltipHeight = percentageY + paddingY - 2;

        tooltipTitle.attr('x', paddingX).attr('y', titleY);
        tooltipDownloads.attr('x', paddingX).attr('y', downloadsY);
        tooltipPercentage.attr('x', paddingX).attr('y', percentageY);
        tooltipBg.attr('width', tooltipWidth).attr('height', tooltipHeight);

        const [mouseX, mouseY] = d3.pointer(event, svg.node());
        const centerX = width / 2;
        const centerY = height / 2;
        const gap = 8;
        let offsetX = gap;
        let offsetY = gap;
        if (mouseX > centerX) offsetX = -(tooltipWidth + gap);
        if (mouseY > centerY) offsetY = -(tooltipHeight + gap);

        tooltipGroup
          .attr(
            'transform',
            `translate(${mouseX + offsetX}, ${mouseY + offsetY})`
          )
          .style('opacity', '1');
      })
      .on('mousemove', function (event: any) {
        const [mouseX, mouseY] = d3.pointer(event, svg.node());
        const centerX = width / 2;
        const centerY = height / 2;
        const tooltipWidth = parseFloat(tooltipBg.attr('width'));
        const tooltipHeight = parseFloat(tooltipBg.attr('height'));
        const gap = 8;
        let offsetX = gap;
        let offsetY = gap;
        if (mouseX > centerX) offsetX = -(tooltipWidth + gap);
        if (mouseY > centerY) offsetY = -(tooltipHeight + gap);
        tooltipGroup.attr(
          'transform',
          `translate(${mouseX + offsetX}, ${mouseY + offsetY})`
        );
      })
      .on('mouseleave', function (_event: any, d: any) {
        d3.select(this).attr(
          'fill-opacity',
          arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0
        );
        tooltipGroup.style('opacity', '0');
      });

    sel
      .filter((d: any) => !!d.children || isAggregatedNode(d.data))
      .style('cursor', 'pointer')
      .on('click', clicked);
  }

  function renderFromRoot() {
    const descendants = root.descendants().slice(1);

    // Join paths
    path = pathGroup
      .selectAll('path')
      .data(descendants, (d: any) => d.data.name)
      .join(
        (enter: any) =>
          enter
            .append('path')
            .attr('fill', (d: any) => {
              let node = d;
              while (node.depth > 1) node = node.parent!;
              return color(node.data.name);
            })
            .attr('data-name', (d: any) => d.data.name)
            .call(setupPathHandlers),
        (update: any) => update,
        (exit: any) => exit.remove()
      )
      .attr('fill-opacity', (d: any) =>
        arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0
      )
      .attr('pointer-events', (d: any) =>
        arcVisible(d.current) ? 'auto' : 'none'
      )
      .attr('d', (d: any) => arc(d.current!));

    // Join labels
    label = labelGroup
      .selectAll('text')
      .data(descendants, (d: any) => d.data.name)
      .join(
        (enter: any) =>
          enter
            .append('text')
            .attr('dy', '0.35em')
            .attr('fill', colors?.labelColor || '#000'),
        (update: any) => update,
        (exit: any) => exit.remove()
      )
      .attr('fill-opacity', (d: any) => {
        if (
          d.parent &&
          d.parent.data.name === d.data.name &&
          labelVisible(d.parent.current)
        ) {
          return 0;
        }
        return +labelVisible(d.current);
      })
      .attr('transform', (d: any) => labelTransform(d.current))
      .text((d: any) => d.data.name);

    parent.datum(root);
  }

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
    .on('mouseenter', () => d3.select('#innerCircle').attr('fill', centerHover))
    .on('mouseleave', () => d3.select('#innerCircle').attr('fill', centerFill));

  // Initial render
  renderFromRoot();

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

  function updateData(newData: SunburstData) {
    const newRoot = partition(newData, sortComparator) as any;
    newRoot.each((d: any) => (d.current = d));

    // Build a map of name -> new node for position targets
    const newNodeMap = new Map<string, any>();
    newRoot.each((d: any) => newNodeMap.set(d.data.name, d));

    // Set targets on old nodes for the transition animation
    root.each((d: any) => {
      const match = newNodeMap.get(d.data.name);
      if (match) {
        d.target = {
          x0: match.x0,
          x1: match.x1,
          y0: match.y0,
          y1: match.y1,
        };
      } else {
        d.target = { x0: 0, x1: 0, y0: d.y0, y1: d.y1 };
      }
    });

    const t = g.transition().duration(750);

    path
      .transition(t as any)
      .tween('data', (d: any) => {
        const i = d3.interpolate(d.current, d.target);
        return (t: any) => (d.current = i(t));
      })
      .attr('fill-opacity', (d: any) =>
        arcVisible(d.target) ? (d.children ? 0.6 : 0.4) : 0
      )
      .attr('pointer-events', (d: any) =>
        arcVisible(d.target) ? 'auto' : 'none'
      )
      .attrTween('d', (d: any) => () => arc(d.current!) as any);

    label
      .transition(t as any)
      .attr('fill-opacity', (d: any) => {
        if (
          d.parent &&
          d.parent.data.name === d.data.name &&
          labelVisible(d.parent.target)
        ) {
          return 0;
        }
        return +labelVisible(d.target);
      })
      .attrTween('transform', (d: any) => () => labelTransform(d.current));

    // After transition: replace root and rebind DOM to new hierarchy
    t.end()
      .then(() => {
        root = newRoot;
        totalValue = root.value || 0;
        renderFromRoot();
      })
      .catch(() => {
        // Transition interrupted — still replace root
        root = newRoot;
        totalValue = root.value || 0;
        renderFromRoot();
      });
  }

  // Subscribe to store — react to data changes with animated transitions
  let unsubscribe = () => {};
  if (store) {
    unsubscribe = store.subscribe((state, prevState) => {
      if (
        state.sunburstChartData &&
        state.sunburstChartData !== prevState.sunburstChartData
      ) {
        updateData(state.sunburstChartData);
      }
    });
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

  return { svg: svg.node() as SVGSVGElement, unsubscribe };
}
