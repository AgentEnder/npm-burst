import { useMemo } from 'react';
import { isLeafNode, SunburstData, SunburstLeafNode } from './sunburst';

type DataNode = SunburstData | SunburstLeafNode;

export function Table({ data }: { data: DataNode }) {
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
              <TopVersionRow data={dataNode} total={total} />
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
              <tr>
                <th>{dataNode.name}</th>
                <td>{formatCount(getCount(dataNode))}</td>
                <td>
                  {formatPercentage((getCount(dataNode) / total) * 100)} %
                </td>
              </tr>
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

function TopVersionRow({ data, total }: { data: DataNode; total: number }) {
  const count = getCount(data);
  if (hasChildren(data)) {
    const children = [...data.children]
      .reverse()
      .filter((node) => getCount(node) > 0);
    const rowSpan = children?.length || 1;
    return (
      <>
        <tr>
          <th rowSpan={rowSpan}>{data.name}</th>
          <td rowSpan={rowSpan}>{formatCount(count)}</td>
          <td rowSpan={rowSpan}>{formatPercentage((count / total) * 100)}</td>
          <td>{children[0].name}</td>
          <td>{formatCount(getCount(children[0]))}</td>
          <td>{formatPercentage((getCount(children[0]) / total) * 100)}</td>
        </tr>
        {children.slice(1).map((child) => (
          <tr>
            <td>{child.name}</td>
            <td>{formatCount(getCount(child))}</td>
            <td>{formatPercentage((getCount(child) / total) * 100)}</td>
          </tr>
        ))}
      </>
    );
  } else {
    return (
      <tr>
        <th>{data.name}</th>
        <td>{formatCount(count)}</td>
        <td>{formatPercentage((count / total) * 100)}</td>
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
