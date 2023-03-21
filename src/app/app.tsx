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
import { Navbar } from './components/navbar';
import { useUrlParam } from './hooks/url-params';

export function App() {
  const [npmPackageName, setNpmPackageName] = useUrlParam<string>(
    'package',
    'nx'
  );
  const [sortByVersion, setSortByVersion] = useUrlParam<boolean>('sortBy', {
    defaultValue: true,
    serializer: {
      serialize: (v) => (v ? 'version' : null),
      deserialize: (s) => s === 'version',
    },
  });

  const [lowPassFilter, setLowPassFilter] = useUrlParam('lpf', {
    defaultValue: 0.001,
    serializer: {
      serialize: (v) => `${(v * 100).toFixed(2)}`,
      deserialize: (s) => {
        const matches = s.match(/([0-9]+.?[0-9]*)/);
        if (matches) {
          return Number.parseFloat(matches[0]) / 100;
        }
        return 0.001;
      },
    },
  });

  const [rawDownloadData, setRawDownloadData] =
    useState<NpmDownloadsByVersion | null>();
  const [sunburstChartData, setSunburstChartData] =
    useState<SunburstData | null>();

  useEffect(() => {
    if (npmPackageName) {
      getDownloadsByVersion(npmPackageName).then((downloads) => {
        setRawDownloadData(downloads);
      });
    }
  }, [npmPackageName]);

  useEffect(() => {
    if (rawDownloadData) {
      setSunburstChartData(
        getSunburstDataFromDownloads(rawDownloadData, lowPassFilter)
      );
    }
  }, [lowPassFilter, rawDownloadData]);

  return (
    <>
      <Navbar></Navbar>
      <Card>
        <h1 style={{ textAlign: 'center' }}>
          NPM Downloads for {npmPackageName}
        </h1>
        <label>
          NPM Package:
          <input
            type="text"
            style={{
              maxWidth: '100px',
            }}
            onKeyDown={(evt: React.KeyboardEvent<HTMLInputElement>) => {
              if (evt.key === 'Enter') {
                const target = evt.target as HTMLInputElement;
                setNpmPackageName(target.value?.toLocaleLowerCase());
              }
            }}
            placeholder="NPM Package"
          ></input>
        </label>
        <label>
          Sort by version?
          <input
            type="checkbox"
            checked={sortByVersion}
            onChange={() => {
              setSortByVersion(!sortByVersion);
            }}
          ></input>
        </label>
        <label
          title={`Versions under ${(lowPassFilter * 100).toFixed(
            2
          )}% are hidden from the graph`}
        >
          Low pass filter:
          <input
            type="number"
            step={0.1}
            min={0}
            max={100}
            value={lowPassFilter * 100}
            onChange={(t) => setLowPassFilter(t.target.valueAsNumber / 100)}
          ></input>
        </label>
        {sunburstChartData ? (
          <Sunburst
            data={sunburstChartData}
            sortByVersion={sortByVersion}
          ></Sunburst>
        ) : null}
      </Card>
    </>
  );
}

export default App;

function getSunburstDataFromDownloads(
  { downloads, package: pkg }: NpmDownloadsByVersion,
  lowPassFilter: number
) {
  const totalDownloads = Object.values(downloads).reduce(
    (acc, next) => acc + next,
    0
  );
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
                children: tags.reduce((acc, [tag, value]) => {
                  if (value / totalDownloads > lowPassFilter) {
                    acc.push({
                      name: tag.trim().length
                        ? `v${major}.${minor}.${patch}-${tag}`
                        : `v${major}.${minor}.${patch}`,
                      value,
                    });
                  }
                  return acc;
                }, [] as SunburstLeafNode[]),
              }
            : {
                name: `v${major}.${minor}.${patch}`,
                value: tags[0][1],
              };
        if (
          calculateNodeValue(accumulator[major][minor][patch]) /
            totalDownloads >
          lowPassFilter
        ) {
          t2node.children.push(t3node);
        }
      }
      if (
        calculateNodeValue(accumulator[major][minor]) / totalDownloads >
        lowPassFilter
      ) {
        t1node.children.push(t2node);
      }
    }
    if (
      calculateNodeValue(accumulator[major]) / totalDownloads >
      lowPassFilter
    ) {
      data.children.push(t1node);
    }
  }
  return data;
}

type RecursiveNode =
  | {
      [key: string]: number | RecursiveNode;
    }
  | number;

function calculateNodeValue(data: RecursiveNode): number {
  if (typeof data === 'number') {
    return data;
  } else {
    return Object.values(data).reduce<number>(
      (val, next) => val + calculateNodeValue(next),
      0
    );
  }
}
