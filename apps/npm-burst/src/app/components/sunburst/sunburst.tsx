import { useEffect, useRef, useMemo, memo } from 'react';
import { coerce, gt } from 'semver';
import {
  sunburst,
  SunburstData,
  SunburstLeafNode,
  SunburstResult,
  isAggregatedNode,
} from './d3-sunburst';
import { useTheme } from '../../context/theme-context';
import {
  generateThemeColorPalette,
  getThemeChartColors,
} from '../../utils/theme-colors';
import { appStore, useAppStore } from '../../store';

export const Sunburst = memo(function Sunburst(props: {
  data: SunburstData;
  sortByVersion: boolean;
  initialSelection: string | null;
  onVersionChange: (version: string | null, isAggregated?: boolean) => void;
}) {
  const { theme } = useTheme();
  const { data, sortByVersion, initialSelection, onVersionChange } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<SunburstResult | null>(null);

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

  // Read store data to know when to apply initial selection
  const storeData = useAppStore((s) => s.sunburstChartData);

  // Create chart once; D3 subscribes to the store for data updates
  // Recreate only when sort order or theme changes (structural changes)
  useEffect(() => {
    const chart = containerRef.current;
    if (!chart || !data) return;

    // Clean up previous chart
    chartRef.current?.unsubscribe();
    while (chart.firstChild) {
      chart.removeChild(chart.firstChild);
    }

    const colorCount = data.children.length + 1;
    const palette = generateThemeColorPalette(colorCount, theme);
    const chartColors = getThemeChartColors(theme);

    const result = sunburst({
      data,
      store: appStore,
      sortComparator,
      selectionUpdated: (selection, isAggregated) => {
        const version = selection === 'versions' ? null : selection;
        onVersionChange(version, isAggregated);
      },
      colors: {
        palette,
        ...chartColors,
      },
    });

    chart.appendChild(result.svg!);
    chartRef.current = result;

    // Apply initial selection
    if (initialSelection) {
      setTimeout(() => {
        const targetVersion = document.querySelector(
          `[data-name="${initialSelection}"]`
        );
        targetVersion?.dispatchEvent(new Event('click'));
      }, 50);
    }

    return () => {
      result.unsubscribe();
    };
    // data is intentionally excluded — store subscription handles data updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortComparator, theme, onVersionChange]);

  // Re-apply selection when store data changes (e.g., snapshot switch)
  useEffect(() => {
    if (!storeData || !initialSelection) return;
    setTimeout(() => {
      const targetVersion = document.querySelector(
        `[data-name="${initialSelection}"]`
      );
      targetVersion?.dispatchEvent(new Event('click'));
    }, 800); // After the 750ms transition
  }, [storeData, initialSelection]);

  return <div id="chart" ref={containerRef}></div>;
});
