// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useEffect, useState } from 'react';
import { getDownloadsByVersion } from '@npm-burst/npm/data-access';
import { sunburst, SunburstData, SunburstLeafNode } from './sunburst/sunburst';
import { parse } from 'semver';

export function App() {
  const [npmDownloads, setNpmDownloads] = useState<Awaited<
    ReturnType<typeof getDownloadsByVersion>
  > | null>(null);

  const [sunburstChartData, setSunburstChartData] =
    useState<SunburstData | null>();

  useEffect(() => {
    const chart = document.getElementById('chart');
    if (chart && sunburstChartData) {
      for (const child of Array.from(chart.children)) {
        chart.removeChild(child);
      }
      chart.appendChild(sunburst(sunburstChartData)!);
    }
  }, [sunburstChartData]);

  useEffect(() => {
    if (npmDownloads) {
      const data: SunburstData = {
        name: 'versions',
        children: [],
      };
      const accumulator: {
        [majorVersion: string]: {
          [minorVersion: string]: {
            [patchVersion: string]: {
              [tagAndNumber: string]: number;
            };
          };
        };
      } = {};
      for (const version in npmDownloads.downloads) {
        const { major, minor, patch, prerelease } = parse(version)!;
        accumulator[major] ??= {};
        accumulator[major][minor] ??= {};
        accumulator[major][minor][patch] ??= {};
        accumulator[major][minor][patch][prerelease.join('.')] ??=
          npmDownloads.downloads[version];
      }
      for (const major in accumulator) {
        const t1node: SunburstData = {
          name: `v${major}`,
          children: [],
        };
        for (const minor in accumulator[major]) {
          const t2node: SunburstData = {
            name: `v${major}.${minor}`,
            children: [],
          };
          for (const patch in accumulator[major][minor]) {
            const tags = Object.entries(accumulator[major][minor][patch]);
            const t3node: SunburstData | SunburstLeafNode =
              tags.length > 1
                ? {
                    name: `v${major}.${minor}.${patch}`,
                    children: tags.map(([tag, value]) => ({
                      name: tag.trim().length
                        ? `v${major}.${minor}.${patch}-${tag}`
                        : `v${major}.${minor}.${patch}`,
                      value,
                    })),
                  }
                : {
                    name: `v${major}.${minor}.${patch}`,
                    value: tags[0][1],
                  };
            t2node.children.push(t3node);
          }
          t1node.children.push(t2node);
        }
        data.children.push(t1node);
      }
      setSunburstChartData(data);
    }
  }, [npmDownloads]);

  useEffect(() => {
    getDownloadsByVersion('@angular/core').then((downloads) => setNpmDownloads(downloads));
  }, []);

  return (
    <>
      <div>NPM Downloads</div>
      {npmDownloads ? <div id="chart"></div> : null}
    </>
  );
}

export default App;
