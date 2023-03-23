import { useEffect, useState } from 'react';
import { coerce, gt } from 'semver';
import {
  D3SunburstOptions,
  sunburst,
  SunburstData,
  SunburstLeafNode,
} from './d3-sunburst';

export function Sunburst(props: {
  data: SunburstData;
  sortByVersion: boolean;
  initialSelection: string | null;
  onVersionChange: (version: string | null) => void;
}) {
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  useEffect(() => {
    console.log(props);
    if (props.initialSelection) {
      setTimeout(() => {
        const targetVersion = document.querySelector(
          `[data-name="${props.initialSelection}"]`
        );
        console.log(targetVersion);
        targetVersion?.dispatchEvent(new Event('click'));
      }, 100);
    }
  }, []);
  useEffect(() => {
    const chart = document.getElementById('chart');
    const sunburstOptions: D3SunburstOptions = {
      data: props.data,
      selectionUpdated: (selection) => {
        const version = selection === 'versions' ? null : selection;
        setSelectedVersion(version);
        props.onVersionChange(version);
      },
    };
    if (chart) {
      for (const child of Array.from(chart.children)) {
        chart.removeChild(child);
      }
      if (props.data) {
        if (props.sortByVersion) {
          const byVersion = (a, b) => {
            const vA = coerce(a.data.name);
            const vB = coerce(b.data.name);
            if (!vA || !vB) {
              return a.value! - b.value!;
            } else {
              return gt(vA, vB) ? -1 : 1;
            }
          };
          sunburstOptions.sortComparator = byVersion;
        }
        chart.appendChild(sunburst(sunburstOptions)!);
      }
    }
  }, [props.data, props.sortByVersion]);

  return <div id="chart"></div>;
}
