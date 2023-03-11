import { useEffect } from 'react';
import { sunburst, SunburstData } from './d3-sunburst';

export function Sunburst(props: { data: SunburstData }) {
  useEffect(() => {
    const chart = document.getElementById('chart');
    if (chart) {
      for (const child of Array.from(chart.children)) {
        chart.removeChild(child);
      }
      if (props.data) {
        chart.appendChild(sunburst(props.data)!);
      }
    }
  }, [props.data]);

  return <div id="chart"></div>;
}
