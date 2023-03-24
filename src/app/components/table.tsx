import { useMemo } from 'react';
import { isLeafNode, SunburstData, SunburstLeafNode } from './sunburst';

type DataNode = SunburstData | SunburstLeafNode;

export function Table({
  data,
  highlightedVersion,
}: {
  data: DataNode;
  highlightedVersion: string | null;
}) {
  const total = useMemo<number>(() => getCount(data), [data]);
  if (!isLeafNode(data) && hasGrandChildren(data)) {
    return (
      <table>
        <thead>
          <tr>
            <th>Version</th>
            <th>Count</th>
            <th>
              Percentage of{' '}
              {data.name && data.name !== 'versions'
                ? data.name
                : `all versions`}
            </th>
            <th>Sub-Version</th>
            <th>Count</th>
            <th>
              Percentage of{' '}
              {data.name && data.name !== 'versions'
                ? data.name
                : `all versions`}
            </th>
          </tr>
        </thead>
        <tbody>
          {[...data.children]
            .reverse()
            .filter((node) => getCount(node) > 0)
            .map((dataNode) => (
              <TopVersionRow
                key={dataNode.name}
                data={dataNode}
                total={total}
                highlightedVersion={highlightedVersion}
              />
            ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={4}>Total</th>
            <th colSpan={2}>{formatCount(total)}</th>
          </tr>
        </tfoot>
      </table>
    );
  } else if (!isLeafNode(data)) {
    return (
      <table>
        <thead>
          <tr>
            <th>Version</th>
            <th>Count</th>
            <th>
              Percentage of{' '}
              {data.name && data.name !== 'versions'
                ? data.name
                : `all versions`}
            </th>
          </tr>
        </thead>
        <tbody>
          {[...data.children]
            .reverse()
            .filter((node) => getCount(node) > 0)
            .map((dataNode) => (
              <div
                style={{
                  display: 'contents',
                  border: '5px solid black',
                  padding: '5px',
                }}
                className={
                  highlightedVersion == dataNode.name ? 'glow' : undefined
                }
              >
                <tr
                  key={dataNode.name}
                  className={
                    highlightedVersion == dataNode.name ? 'glow' : undefined
                  }
                >
                  <th>{dataNode.name}</th>
                  <td>{formatCount(getCount(dataNode))}</td>
                  <td>
                    {formatPercentage((getCount(dataNode) / total) * 100)}
                  </td>
                </tr>
              </div>
            ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={2}>Total</th>
            <th>{formatCount(total)}</th>
          </tr>
        </tfoot>
      </table>
    );
  }
}

function TopVersionRow({
  data,
  total,
  highlightedVersion,
}: {
  data: DataNode;
  total: number;
  highlightedVersion: string | null;
}) {
  const count = getCount(data);
  if (hasChildren(data)) {
    const children = [...data.children]
      .reverse()
      .filter((node) => getCount(node) > 0);
    const rowSpan = (children?.length || 0) + 1;
    return (
      <>
        <tr className={highlightedVersion === data.name ? 'glow' : undefined}>
          <th rowSpan={rowSpan}>{data.name} | </th>
          <td rowSpan={rowSpan}>{formatCount(count)}</td>
          <td rowSpan={rowSpan}>{formatPercentage((count / total) * 100)}</td>
        </tr>
        {children.map((child) => (
          <tr
            key={child.name}
            className={highlightedVersion === child.name ? 'glow' : undefined}
          >
            <th>{child.name}</th>
            <td>{formatCount(getCount(child))}</td>
            <td>{formatPercentage((getCount(child) / total) * 100)}</td>
          </tr>
        ))}
      </>
    );
  } else {
    return (
      <tr>
        <th className={highlightedVersion === data.name ? 'glow' : undefined}>
          {data.name}
        </th>
        <td className={highlightedVersion === data.name ? 'glow' : undefined}>
          {formatCount(count)}
        </td>
        <td className={highlightedVersion === data.name ? 'glow' : undefined}>
          {formatPercentage((count / total) * 100)}
        </td>
      </tr>
    );
  }
}

function getCount(data: DataNode): number {
  if ('value' in data) {
    return data.value;
  } else {
    return data.children.reduce((acc, child) => acc + getCount(child), 0);
  }
}

function hasChildren(data: DataNode): data is SunburstData {
  return !isLeafNode(data) && data.children.length > 0;
}

function hasGrandChildren(data: SunburstData): boolean {
  return hasChildren(data) && data.children.some(hasChildren);
}

function formatCount(count: number): string {
  if (count > 100_000_000) {
    return `${(count / 1000000).toFixed(0)}m`;
  }
  if (count > 10_000_000) {
    return `${(count / 1000000).toFixed(1)}m`;
  }
  if (count > 1_000_000) {
    return `${(count / 1000000).toFixed(2)}m`;
  }
  if (count > 100_000) {
    return `${(count / 1000).toFixed(0)}k`;
  }
  if (count > 10_000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  if (count > 1_000) {
    return `${(count / 1000).toFixed(2)}k`;
  }
  return count.toString();
}

function formatPercentage(percentage: number): string {
  if (percentage > 10) {
    return `${percentage.toFixed(1)}%`;
  }
  if (percentage > 1) {
    return `${percentage.toFixed(2)}%`;
  }
  return `${percentage.toFixed(3)}%`;
}
