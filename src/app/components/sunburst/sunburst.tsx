import { useEffect, memo } from 'react';
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
    const chart = document.getElementById('chart');
    if (!chart || !data) return;

    // Clear existing chart
    for (const child of Array.from(chart.children)) {
      chart.removeChild(child);
    }

    // Generate theme-aware colors
    const colorCount = data.children.length + 1;
    const palette = generateThemeColorPalette(colorCount, theme);
    const chartColors = getThemeChartColors(theme);

    const sunburstOptions: D3SunburstOptions = {
      data: data,
      selectionUpdated: (selection, isAggregated) => {
        const version = selection === 'versions' ? null : selection;
        onVersionChange(version, isAggregated);
      },
      colors: {
        palette,
        ...chartColors,
      },
    };

    if (sortByVersion) {
      const byVersion = (
        a: { data: SunburstData | SunburstLeafNode; value?: number },
        b: { data: SunburstData | SunburstLeafNode; value?: number }
      ) => {
        // Always sort aggregated nodes to the end
        const aIsAggregated = isAggregatedNode(a.data);
        const bIsAggregated = isAggregatedNode(b.data);

        if (aIsAggregated && !bIsAggregated) return 1; // a goes after b
        if (!aIsAggregated && bIsAggregated) return -1; // a goes before b
        if (aIsAggregated && bIsAggregated) return 0; // both aggregated, keep order

        // Neither is aggregated, sort by version
        const vA = coerce(a.data.name);
        const vB = coerce(b.data.name);
        if (!vA || !vB) {
          return a.value! - b.value!;
        } else {
          return gt(vA, vB) ? -1 : 1;
        }
      };
      sunburstOptions.sortComparator = byVersion;
    } else {
      // Sort by value but keep aggregated nodes at the end
      const byValueWithAggregatedLast = (
        a: { data: SunburstData | SunburstLeafNode; value?: number },
        b: { data: SunburstData | SunburstLeafNode; value?: number }
      ) => {
        // Always sort aggregated nodes to the end
        const aIsAggregated = isAggregatedNode(a.data);
        const bIsAggregated = isAggregatedNode(b.data);

        if (aIsAggregated && !bIsAggregated) return 1; // a goes after b
        if (!aIsAggregated && bIsAggregated) return -1; // a goes before b
        if (aIsAggregated && bIsAggregated) return 0; // both aggregated, keep order

        // Neither is aggregated, sort by value
        return b.value! - a.value!;
      };
      sunburstOptions.sortComparator = byValueWithAggregatedLast;
    }

    chart.appendChild(sunburst(sunburstOptions)!);
  }, [data, sortByVersion, theme, onVersionChange]);

  return <div id="chart"></div>;
});
