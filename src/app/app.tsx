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
  const [npmPackageName, setNpmPackageName] = useState<string>(
    new URLSearchParams(document.location.search).get('package') ?? 'nx'
  );
  const [sortByVersion, setSortByVersion] = useState(
    new URLSearchParams(document.location.search).get('sortBy') === 'version'
  );

  const [sunburstChartData, setSunburstChartData] =
    useState<SunburstData | null>();

  window.addEventListener('popstate', () => {
    setPropsFromQueryParams();
  });

  useEffect(() => {
    if (npmPackageName) {
      setQueryParam('package', npmPackageName);
      getDownloadsByVersion(npmPackageName).then((downloads) => {
        if (downloads) {
          setSunburstChartData(getSunburstDataFromDownloads(downloads));
        }
      });
    }
  }, [npmPackageName]);

  useEffect(() => {
    setQueryParam('sortBy', 'version');
  }, [sortByVersion]);

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
          defaultValue={npmPackageName}
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
    setNpmPackageName(urlParams.get('package') ?? npmPackageName);
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

function setQueryParam(key: string, value: string) {
  const urlParams = new URLSearchParams(document.location.search);
  if (value !== null && value !== undefined) {
    urlParams.set(key, value);
  } else {
    urlParams.delete(key);
  }
  window.history.pushState(
    {},
    document.title,
    document.location.href.split('?')[0] + `?` + urlParams.toString()
  );
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
