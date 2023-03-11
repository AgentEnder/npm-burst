import { useEffect, useState } from 'react';
import {
  getDownloadsByVersion,
  NpmDownloadsByVersion,
} from '@npm-burst/npm/data-access';
import {
  Sunburst,
  SunburstData,
  SunburstLeafNode,
} from './components/sunburst';
import { parse } from 'semver';
import { Card } from './components/card';

export function App() {
  const [npmPackageName, setNpmPackageName] = useState<string | null>('nx');

  const [sunburstChartData, setSunburstChartData] =
    useState<SunburstData | null>();

  useEffect(() => {
    if (npmPackageName) {
      getDownloadsByVersion(npmPackageName).then((downloads) => {
        if (downloads) {
          setSunburstChartData(getSunburstDataFromDownloads(downloads));
        }
      });
    }
  }, [npmPackageName]);

  useEffect(() => {
    const urlParams = new URLSearchParams(document.location.search);
    setNpmPackageName(urlParams.get('package') ?? 'nx');
  }, []);

  return (
    <Card>
      <h1 style={{ textAlign: 'center' }}>
        NPM Downloads for {npmPackageName}
      </h1>
      <input
        type="text"
        style={{
          maxWidth: '100px',
        }}
        onKeyDown={(evt: React.KeyboardEvent<HTMLInputElement>) => {
          if (evt.key === 'Enter') {
            const target = evt.target as HTMLInputElement;
            setNpmPackageName(target.value);
            window.history.replaceState(
              {},
              document.title,
              document.location.href.split('?')[0] + '?package=' + target.value
            );
          }
        }}
      ></input>
      {sunburstChartData ? (
        <Sunburst data={sunburstChartData}></Sunburst>
      ) : null}
    </Card>
  );
}

export default App;

function getSunburstDataFromDownloads({ downloads }: NpmDownloadsByVersion) {
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
  for (const version in downloads) {
    const { major, minor, patch, prerelease } = parse(version)!;
    accumulator[major] ??= {};
    accumulator[major][minor] ??= {};
    accumulator[major][minor][patch] ??= {};
    accumulator[major][minor][patch][prerelease.join('.')] ??=
      downloads[version];
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
  return data;
}
