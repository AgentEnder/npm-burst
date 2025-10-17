import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  getDownloadsByVersion,
  NpmDownloadsByVersion,
} from '@npm-burst/npm/data-access';
import {
  isLeafNode,
  Sunburst,
  SunburstData,
  SunburstLeafNode,
} from './components/sunburst';
import { parse } from 'semver';
import { Card } from './components/card';
import { Navbar } from './components/navbar';
import { useUrlParam } from './hooks/url-params';
import { Table } from './components/table';
import { LoadingSkeleton } from './components/loading-skeleton';
import { ErrorMessage } from './components/error-message';
import { Popover } from './components/popover';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import styles from './app.module.scss';

export function App() {
  const [npmPackageName, setNpmPackageName] = useUrlParam<string>(
    'package',
    'nx'
  );
  const [sortByVersion, setSortByVersion] = useUrlParam<boolean>('sortBy', {
    defaultValue: true,
    serializer: {
      serialize: (v) => (v ? 'version' : null),
      deserialize: ((s) => s === 'version') as (s: string) => true | false,
    },
  });
  const [showDataTable, setShowDataTable] = useState(true);

  const [lowPassFilter, setLowPassFilter] = useUrlParam('lpf', {
    defaultValue: 0.02,
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
    useState<SunburstData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedVersion, setSelectedVersion] = useUrlParam<string | null>(
    'selectedVersion',
    'versions'
  );

  const expandedNodesSerializer = useMemo(
    () => ({
      serialize: (arr: string[]) => (arr.length > 0 ? arr.join(',') : null),
      deserialize: (str: string) => str.split(',').filter((s) => s.length > 0),
    }),
    []
  );

  const [expandedNodesRaw, setExpandedNodes] = useUrlParam<string[]>(
    'expanded',
    {
      defaultValue: [],
      serializer: expandedNodesSerializer,
    }
  );

  // Memoize expandedNodes to prevent new array references on every render
  const expandedNodes = useMemo(
    () => expandedNodesRaw,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(expandedNodesRaw)]
  );

  const selectedNode = useMemo<SunburstData | SunburstLeafNode | null>(
    () => findNodeByVersion(sunburstChartData, selectedVersion || null),
    [sunburstChartData, selectedVersion]
  );

  const handleVersionClick = useCallback(
    (version: string | null, isAggregated?: boolean) => {
      if (!version) {
        setSelectedVersion(null);
        return;
      }

      if (isAggregated) {
        // Expand the aggregated node if not already expanded
        if (!expandedNodes.includes(version)) {
          setExpandedNodes([...expandedNodes, version]);
        }

        // Navigate to the parent of the aggregated node so user can see the expanded children
        const parent = getParentOfAggregatedNode(version);
        setSelectedVersion(parent);
      } else {
        // Select the version normally
        setSelectedVersion(version);
      }
    },
    [expandedNodes, setExpandedNodes, setSelectedVersion]
  );

  const fetchData = useCallback(() => {
    if (!npmPackageName) return;

    const { get, cancel } = getDownloadsByVersion(npmPackageName);
    setIsLoading(true);
    setError(null);

    get()
      .then((downloads) => {
        if (downloads) {
          setRawDownloadData(downloads);
          setError(null);
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setError(
            `Failed to load data for "${npmPackageName}". The package may not exist or there was a network error.`
          );
        }
      })
      .finally(() => {
        setIsLoading(false);
      });

    return cancel;
  }, [npmPackageName]);

  useEffect(() => {
    const cancel = fetchData();
    return () => {
      cancel?.();
    };
  }, [fetchData]);

  useEffect(() => {
    if (rawDownloadData) {
      setSunburstChartData(
        getSunburstDataFromDownloads(
          rawDownloadData,
          lowPassFilter,
          expandedNodes
        )
      );
    }
  }, [lowPassFilter, rawDownloadData, expandedNodes]);

  return (
    <>
      <Navbar />
      <Card>
        <h1>NPM Downloads for {npmPackageName}</h1>
        <div className={styles.controls}>
          <div className={styles.inputGroup}>
            <label htmlFor="npm-package-input" className={styles.label}>
              NPM Package
            </label>
            <input
              id="npm-package-input"
              type="text"
              className={styles.input}
              onKeyDown={(evt: React.KeyboardEvent<HTMLInputElement>) => {
                if (evt.key === 'Enter') {
                  const target = evt.target as HTMLInputElement;
                  setNpmPackageName(target.value?.toLowerCase());
                  setSelectedVersion(null);
                  setExpandedNodes([]);
                }
              }}
              placeholder="e.g., react, lodash, express"
            />
          </div>

          <div className={styles.optionsRow}>
            <label className={styles.checkboxWrapper}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={sortByVersion}
                onChange={() => setSortByVersion(!sortByVersion)}
              />
              <span className={styles.checkboxLabel}>Sort by version</span>
            </label>

            <label className={styles.checkboxWrapper}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={showDataTable}
                onChange={() => setShowDataTable(!showDataTable)}
              />
              <span className={styles.checkboxLabel}>Show data table</span>
            </label>

            <div className={styles.numberInputWrapper}>
              <label htmlFor="lpf-input" className={styles.label}>
                Low pass filter (%)
                <Popover
                  content={
                    <div className={styles.popoverContent}>
                      <strong>How Low Pass Filter Works</strong>
                      <p>
                        Nodes with a percentage lower than the filter threshold
                        are aggregated into special nodes:
                      </p>
                      <ul>
                        <li>
                          <strong>Other</strong>: Aggregates small major
                          versions at the root level
                        </li>
                        <li>
                          <strong>X.?</strong>: Aggregates small minor/patch
                          versions within a major version
                        </li>
                        <li>
                          <strong>X.Y.Z-other</strong>: Aggregates small
                          pre-release tags
                        </li>
                      </ul>
                      <p>
                        Click on these nodes to expand and see all versions.
                      </p>
                    </div>
                  }
                >
                  <FontAwesomeIcon
                    icon={faCircleInfo}
                    className={styles.infoIcon}
                  />
                </Popover>
              </label>
              <input
                id="lpf-input"
                type="number"
                className={styles.numberInput}
                step={0.1}
                min={0}
                max={100}
                value={lowPassFilter * 100}
                onChange={(t) => setLowPassFilter(t.target.valueAsNumber / 100)}
              />
              <span className={styles.helpText}>
                Versions under {(lowPassFilter * 100).toFixed(2)}% are
                aggregated
              </span>
            </div>
          </div>
        </div>

        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorMessage message={error} onRetry={fetchData} />
        ) : (
          <div className="container-with-table">
            {sunburstChartData ? (
              <Sunburst
                data={sunburstChartData}
                sortByVersion={sortByVersion}
                onVersionChange={handleVersionClick}
                initialSelection={selectedVersion}
              />
            ) : null}
            {(selectedVersion !== 'versions' || expandedNodes.length > 0) && (
              <button
                className={styles.clearButton}
                onClick={() => {
                  setSelectedVersion(null);
                  setExpandedNodes([]);
                }}
              >
                ↺ Reset Selection
              </button>
            )}
            {selectedNode && showDataTable ? (
              <Table data={selectedNode} onVersionClick={handleVersionClick} />
            ) : null}
          </div>
        )}
      </Card>
    </>
  );
}

export default App;

function getParentOfAggregatedNode(aggregatedNodeName: string): string {
  // "Other" -> "versions" (root)
  if (aggregatedNodeName === 'Other') {
    return 'versions';
  }

  // "v1.?" -> "v1"
  if (aggregatedNodeName.endsWith('.?')) {
    return aggregatedNodeName.slice(0, -2);
  }

  // "v1.2.3-other" -> "v1.2.3"
  if (aggregatedNodeName.endsWith('-other')) {
    return aggregatedNodeName.slice(0, -6);
  }

  // Fallback to versions root
  return 'versions';
}

function getSunburstDataFromDownloads(
  { downloads }: NpmDownloadsByVersion,
  lowPassFilter: number,
  expandedNodes: string[]
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

  // Helper function to get the total value of a node
  function getNodeValue(node: SunburstData | SunburstLeafNode): number {
    if (isLeafNode(node)) {
      return node.value;
    } else {
      return node.children.reduce((sum, child) => sum + getNodeValue(child), 0);
    }
  }

  // Helper function to partition and aggregate children
  function partitionAndAggregate<T extends SunburstData | SunburstLeafNode>(
    children: T[],
    otherNodeName: string
  ): T[] {
    // If this aggregated node has been expanded, skip aggregation
    if (expandedNodes.includes(otherNodeName)) {
      return children;
    }

    const aboveThreshold: T[] = [];
    let belowThresholdSum = 0;

    for (const child of children) {
      const childValue = getNodeValue(child);
      if (childValue / totalDownloads > lowPassFilter) {
        aboveThreshold.push(child);
      } else {
        belowThresholdSum += childValue;
      }
    }

    if (belowThresholdSum > 0) {
      // Create aggregated node as a leaf node with summed value
      aboveThreshold.push({
        name: otherNodeName,
        value: belowThresholdSum,
        isAggregated: true,
      } as T);
    }

    return aboveThreshold;
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

        // Build tag nodes
        const tagNodes: SunburstLeafNode[] = tags.map(([tag, value]) => ({
          name: tag.trim().length
            ? `v${major}.${minor}.${patch}-${tag}`
            : `v${major}.${minor}.${patch}`,
          value,
        }));

        const t3node: SunburstData | SunburstLeafNode =
          tags.length > 1
            ? {
                name: `v${major}.${minor}.${patch}`,
                children: partitionAndAggregate(
                  tagNodes,
                  `v${major}.${minor}.${patch}-other`
                ),
              }
            : tagNodes[0];

        t2node.children.push(t3node);
      }

      // Partition patch nodes
      t2node.children = partitionAndAggregate(
        t2node.children,
        `v${major}.${minor}.?`
      );

      t1node.children.push(t2node);
    }

    // Partition minor nodes
    t1node.children = partitionAndAggregate(t1node.children, `v${major}.?`);

    data.children.push(t1node);
  }

  // Partition major nodes
  data.children = partitionAndAggregate(data.children, 'Other');

  return data;
}

export function findNodeByVersion(
  data: SunburstData | SunburstLeafNode | null,
  version: string | null
): SunburstData | SunburstLeafNode | null {
  if (!data) {
    return null;
  }
  if (version === null) {
    return data;
  }
  if (isLeafNode(data)) {
    if (data.name === version) {
      return data;
    } else {
      return null;
    }
  }
  if (data.name === version) {
    return data;
  } else if (!isLeafNode(data)) {
    for (const child of data.children) {
      const result = findNodeByVersion(child, version);
      if (result) {
        return result;
      }
    }
  }
  return null;
}
