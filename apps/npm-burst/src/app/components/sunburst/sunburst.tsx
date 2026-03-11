import { useEffect, useRef, useMemo, memo } from 'react';
import { coerce, gt } from 'semver';
import {
  D3SunburstOptions,
  sunburst,
  SunburstData,
  SunburstLeafNode,
  isAggregatedNode,
} from './d3-sunburst';
import { useTheme } from '../../context/theme-context';
import {
  generateThemeColorPalette,
  getThemeChartColors,
} from '../../utils/theme-colors';

export const Sunburst = memo(function Sunburst(props: {
  data: SunburstData;
  sortByVersion: boolean;
  initialSelection: string | null;
  onVersionChange: (version: string | null, isAggregated?: boolean) => void;
}) {
  const { theme } = useTheme();
  const { data, sortByVersion, initialSelection, onVersionChange } = props;
  const containerRef = useRef<HTMLDivElement>(null);

  const sortComparator = useMemo(() => {
    if (sortByVersion) {
      return (
        a: { data: SunburstData | SunburstLeafNode; value?: number },
        b: { data: SunburstData | SunburstLeafNode; value?: number }
      ) => {
        const aIsAggregated = isAggregatedNode(a.data);
        const bIsAggregated = isAggregatedNode(b.data);

        if (aIsAggregated && !bIsAggregated) return 1;
        if (!aIsAggregated && bIsAggregated) return -1;
        if (aIsAggregated && bIsAggregated) return 0;

        const vA = coerce(a.data.name);
        const vB = coerce(b.data.name);
        if (!vA || !vB) {
          return a.value! - b.value!;
        } else {
          return gt(vA, vB) ? -1 : 1;
        }
      };
    } else {
      return (
        a: { data: SunburstData | SunburstLeafNode; value?: number },
        b: { data: SunburstData | SunburstLeafNode; value?: number }
      ) => {
        const aIsAggregated = isAggregatedNode(a.data);
        const bIsAggregated = isAggregatedNode(b.data);

        if (aIsAggregated && !bIsAggregated) return 1;
        if (!aIsAggregated && bIsAggregated) return -1;
        if (aIsAggregated && bIsAggregated) return 0;

        return b.value! - a.value!;
      };
    }
  }, [sortByVersion]);

  useEffect(() => {
    if (initialSelection) {
      setTimeout(() => {
        const targetVersion = document.querySelector(
          `[data-name="${initialSelection}"]`
        );
        targetVersion?.dispatchEvent(new Event('click'));
      }, 150);
    }
  }, [initialSelection]);

  useEffect(() => {
    const chart = containerRef.current;
    if (!chart || !data) return;

    const existingSvg = chart.querySelector('svg');
    if (existingSvg && (existingSvg as any).__updateData) {
      // Transition existing chart to new data
      (existingSvg as any).__updateData(data, sortComparator);
    } else {
      // First render — create new chart
      for (const child of Array.from(chart.children)) {
        chart.removeChild(child);
      }

      // Generate theme-aware colors
      const colorCount = data.children.length + 1;
      const palette = generateThemeColorPalette(colorCount, theme);
      const chartColors = getThemeChartColors(theme);

      const sunburstOptions: D3SunburstOptions = {
        data: data,
        sortComparator,
        selectionUpdated: (selection, isAggregated) => {
          const version = selection === 'versions' ? null : selection;
          onVersionChange(version, isAggregated);
        },
        colors: {
          palette,
          ...chartColors,
        },
      };

      chart.appendChild(sunburst(sunburstOptions)!);
    }
  }, [data, sortComparator, theme, onVersionChange]);

  return <div id="chart" ref={containerRef}></div>;
});
