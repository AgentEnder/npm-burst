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
import { isLeafNode } from './components/sunburst/d3-sunburst';

export function App() {
  const [npmPackageName, setNpmPackageName] = useState<string>('nx');
  const [sortByVersion, setSortByVersion] = useState(false);

  const [sunburstChartData, setSunburstChartData] =
    useState<SunburstData | null>();

  window.addEventListener('popstate', (evt: PopStateEvent) => {
    setPropsFromQueryParams();
  });

  useEffect(() => {
    if (npmPackageName) {
      const urlParams = new URLSearchParams(document.location.search);
      urlParams.set('package', npmPackageName);
      window.history.pushState(
        {},
        document.title,
        document.location.href.split('?')[0] + `?` + urlParams.toString()
      );
      getDownloadsByVersion(npmPackageName).then((downloads) => {
        if (downloads) {
          setSunburstChartData(getSunburstDataFromDownloads(downloads));
        }
      });
    }
  }, [npmPackageName]);

  useEffect(() => {
    const urlParams = new URLSearchParams(document.location.search);
    if (sortByVersion) {
      urlParams.set('sortBy', 'version');
    } else {
      urlParams.delete('sortBy');
    }
    window.history.pushState(
      {},
      document.title,
      document.location.href.split('?')[0] + `?` + urlParams.toString()
    );
  }, [sortByVersion]);

  useEffect(() => {
    setPropsFromQueryParams();
  }, []);

  return (
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
              setNpmPackageName(target.value);
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
      {sunburstChartData ? (
        <Sunburst
          data={sunburstChartData}
          sortByVersion={sortByVersion}
        ></Sunburst>
      ) : null}
    </Card>
  );

  function setPropsFromQueryParams() {
    const urlParams = new URLSearchParams(document.location.search);
    setNpmPackageName(urlParams.get('package') ?? 'nx');
    setSortByVersion(urlParams.get('sortBy') === 'version');
  }
}

export default App;

function getSunburstDataFromDownloads({
  downloads,
  package: pkg,
}: NpmDownloadsByVersion) {
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
        if (calculateNodeValue(t3node, pkg) > 0) {
          t2node.children.push(t3node);
        }
      }
      if (calculateNodeValue(t2node, pkg) > 0) {
        t1node.children.push(t2node);
      }
    }
    if (calculateNodeValue(t1node, pkg) > 0) {
      data.children.push(t1node);
    }
  }
  return data;
}

const memo: Map<string, number> = new Map();
function calculateNodeValue(
  data: SunburstData | SunburstLeafNode,
  pkg: string
): number {
  const cacheKey = `${pkg}-${data.name}`;
  const value =
    memo.get(cacheKey) ??
    (isLeafNode(data)
      ? data.value
      : data.children.reduce((acc, node) => {
          return (
            acc +
            (isLeafNode(node) ? node.value : calculateNodeValue(node, pkg))
          );
        }, 0));
  memo.set(cacheKey, value);
  return value;
}
