import { useEffect, useState } from 'react';
import { coerce, gt } from 'semver';
import { sunburst, SunburstData, SunburstLeafNode } from './d3-sunburst';

export function Sunburst(props: {
  data: SunburstData;
  sortByVersion: boolean;
  onVersionChange: (version: string | null) => void;
}) {
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  useEffect(() => {
    const chart = document.getElementById('chart');
    if (chart) {
      for (const child of Array.from(chart.children)) {
        chart.removeChild(child);
      }
      if (props.data) {
        if (props.sortByVersion) {
          chart.appendChild(
            sunburst({
              data: props.data,
              sortComparator: (a, b) => {
                const vA = coerce(a.data.name);
                const vB = coerce(b.data.name);
                if (!vA || !vB) {
                  return a.value! - b.value!;
                } else {
                  return gt(vA, vB) ? -1 : 1;
                }
              },
              selectionUpdated: (selection) => {
                setSelectedVersion(selection);
                props.onVersionChange(selection);
              },
            })
          );
        } else {
          chart.appendChild(
            sunburst({
              data: props.data,
              selectionUpdated: (selection) => {
                setSelectedVersion(selection);
                props.onVersionChange(selection);
              },
            })!
          );
        }
      }
    }
  }, [props.data, props.sortByVersion]);

  return <div id="chart"></div>;
}
