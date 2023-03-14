import { useEffect } from 'react';
import { coerce, gt } from 'semver';
import { sunburst, SunburstData } from './d3-sunburst';

export function Sunburst(props: {
  data: SunburstData;
  sortByVersion: boolean;
}) {
  useEffect(() => {
    const chart = document.getElementById('chart');
    if (chart) {
      for (const child of Array.from(chart.children)) {
        chart.removeChild(child);
      }
      if (props.data) {
        if (props.sortByVersion) {
          chart.appendChild(
            sunburst(props.data, (a, b) => {
              const vA = coerce(a.data.name);
              const vB = coerce(b.data.name);
              if (!vA || !vB) {
                return a.value! - b.value!;
              } else {
                return gt(vA, vB) ? -1 : 1;
              }
            })
          );
        } else {
          chart.appendChild(sunburst(props.data)!);
        }
      }
    }
  }, [props.data, props.sortByVersion]);

  return <div id="chart"></div>;
}
