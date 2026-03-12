import { parse } from 'semver';
import type { NpmDownloadsByVersion } from '@npm-burst/npm/data-access';
import {
  isLeafNode,
  SunburstData,
  SunburstLeafNode,
} from '../components/sunburst';

export function getSunburstDataFromDownloads(
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

  function getNodeValue(node: SunburstData | SunburstLeafNode): number {
    if (isLeafNode(node)) {
      return node.value;
    } else {
      return node.children.reduce((sum, child) => sum + getNodeValue(child), 0);
    }
  }

  function partitionAndAggregate<T extends SunburstData | SunburstLeafNode>(
    children: T[],
    otherNodeName: string
  ): T[] {
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

      t2node.children = partitionAndAggregate(
        t2node.children,
        `v${major}.${minor}.?`
      );

      t1node.children.push(t2node);
    }

    t1node.children = partitionAndAggregate(t1node.children, `v${major}.?`);

    data.children.push(t1node);
  }

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

export function getParentOfAggregatedNode(aggregatedNodeName: string): string {
  if (aggregatedNodeName === 'Other') {
    return 'versions';
  }
  if (aggregatedNodeName.endsWith('.?')) {
    return aggregatedNodeName.slice(0, -2);
  }
  if (aggregatedNodeName.endsWith('-other')) {
    return aggregatedNodeName.slice(0, -6);
  }
  return 'versions';
}
