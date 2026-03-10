import { useMemo, memo, useEffect } from 'react';
import {
  isLeafNode,
  SunburstData,
  SunburstLeafNode,
  isAggregatedNode,
} from './sunburst';

type DataNode = SunburstData | SunburstLeafNode;

export const Table = memo(function Table({
  data,
  onVersionClick,
}: {
  data: DataNode;
  onVersionClick?: (version: string, isAggregated?: boolean) => void;
}): JSX.Element | null {
  const total = useMemo<number>(() => getCount(data), [data]);

  useEffect(() => {
    // Handle hover for rows with rowspan
    const handleMouseEnter = (e: Event) => {
      const row = e.currentTarget as HTMLElement;
      const tbody = row.parentElement;
      if (!tbody) return;

      // Highlight all cells in the current row
      row.querySelectorAll('th, td').forEach((cell) => {
        cell.classList.add('row-hover');
      });

      // Find cells with rowspan and highlight them if they span this row
      const allCells = tbody.querySelectorAll('th[rowspan], td[rowspan]');
      const rows = Array.from(tbody.children);
      const currentRowIndex = rows.indexOf(row);

      allCells.forEach((cell) => {
        const cellElement = cell as HTMLElement;
        const rowspan = parseInt(cellElement.getAttribute('rowspan') || '1');
        const cellRow = cellElement.closest('tr');
        if (!cellRow) return;

        const cellRowIndex = rows.indexOf(cellRow);

        // If current row is within the rowspan range, add hover class
        if (
          currentRowIndex >= cellRowIndex &&
          currentRowIndex < cellRowIndex + rowspan
        ) {
          cellElement.classList.add('row-hover');
        }
      });
    };

    const handleMouseLeave = () => {
      document.querySelectorAll('.row-hover').forEach((cell) => {
        cell.classList.remove('row-hover');
      });
    };

    const rows = document.querySelectorAll('tbody tr');
    rows.forEach((row) => {
      row.addEventListener('mouseenter', handleMouseEnter);
      row.addEventListener('mouseleave', handleMouseLeave);
    });

    // Cleanup
    return () => {
      rows.forEach((row) => {
        row.removeEventListener('mouseenter', handleMouseEnter);
        row.removeEventListener('mouseleave', handleMouseLeave);
      });
    };
  }, [data]);

  const processedRows = useMemo(() => {
    if (isLeafNode(data)) return [];

    return data.children.reduce<
      Array<{
        node: DataNode;
        count: number;
        isAggregated: boolean;
        hasChildren: boolean;
      }>
    >((acc, node) => {
      const count = getCount(node);
      if (count === 0) return acc;

      const row = {
        node,
        count,
        isAggregated: isAggregatedNode(node),
        hasChildren: hasChildren(node),
      };

      // Aggregated nodes go to the end, regular nodes to the front
      if (row.isAggregated) {
        acc.push(row);
      } else {
        acc.unshift(row);
      }

      return acc;
    }, []);
  }, [data]);

  const hasGrandChildrenMemo = useMemo(
    () => !isLeafNode(data) && hasGrandChildren(data),
    [data]
  );

  if (hasGrandChildrenMemo) {
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
          {processedRows.map((row, groupIndex) => (
            <TopVersionRow
              key={row.node.name}
              data={row.node}
              count={row.count}
              isAggregated={row.isAggregated}
              hasChildren={row.hasChildren}
              total={total}
              onVersionClick={onVersionClick}
              groupIndex={groupIndex}
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
          {processedRows.map((row, index) => {
            const isClickable =
              (!isLeafNode(row.node) || row.isAggregated) && onVersionClick;
            const handleClick = isClickable
              ? () => onVersionClick(row.node.name, row.isAggregated)
              : undefined;
            const cursorStyle = isClickable ? 'pointer' : 'default';
            const isEvenRow = index % 2 === 0;

            return (
              <tr
                key={row.node.name}
                className={isEvenRow ? 'row-group-even' : 'row-group-odd'}
              >
                <th onClick={handleClick} style={{ cursor: cursorStyle }}>
                  {row.node.name}
                </th>
                <td onClick={handleClick} style={{ cursor: cursorStyle }}>
                  {formatCount(row.count)}
                </td>
                <td
                  className="monospace"
                  onClick={handleClick}
                  style={{ cursor: cursorStyle }}
                >
                  {formatPercentage((row.count / total) * 100)}
                </td>
              </tr>
            );
          })}
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
  return null;
});

function TopVersionRow({
  data,
  count,
  isAggregated,
  hasChildren: hasChildrenProp,
  total,
  onVersionClick,
  groupIndex,
}: {
  data: DataNode;
  count: number;
  isAggregated: boolean;
  hasChildren: boolean;
  total: number;
  onVersionClick?: (version: string, isAggregated?: boolean) => void;
  groupIndex: number;
}) {
  const isEvenGroup = groupIndex % 2 === 0;

  if (hasChildrenProp && !isLeafNode(data)) {
    const children = [...data.children]
      .reverse()
      .filter((node) => getCount(node) > 0);
    const rowSpan = children?.length || 1;

    const parentClickable =
      (!isLeafNode(data) || isAggregated) && onVersionClick;
    const parentHandleClick = parentClickable
      ? () => onVersionClick(data.name, isAggregated)
      : undefined;
    const parentCursorStyle = parentClickable ? 'pointer' : 'default';

    const firstChildIsAggregated = isAggregatedNode(children[0]);
    const firstChildClickable =
      (!isLeafNode(children[0]) || firstChildIsAggregated) && onVersionClick;
    const firstChildHandleClick = firstChildClickable
      ? () => onVersionClick(children[0].name, firstChildIsAggregated)
      : undefined;
    const firstChildCursorStyle = firstChildClickable ? 'pointer' : 'default';

    return (
      <>
        <tr className={isEvenGroup ? 'row-group-even' : 'row-group-odd'}>
          <th
            rowSpan={rowSpan}
            onClick={parentHandleClick}
            style={{ cursor: parentCursorStyle }}
            className={isEvenGroup ? 'row-group-even' : 'row-group-odd'}
          >
            {data.name}
          </th>
          <td
            rowSpan={rowSpan}
            onClick={parentHandleClick}
            style={{ cursor: parentCursorStyle }}
            className={isEvenGroup ? 'row-group-even' : 'row-group-odd'}
          >
            {formatCount(count)}
          </td>
          <td
            rowSpan={rowSpan}
            className={`monospace ${
              isEvenGroup ? 'row-group-even' : 'row-group-odd'
            }`}
            onClick={parentHandleClick}
            style={{ cursor: parentCursorStyle }}
          >
            {formatPercentage((count / total) * 100)}
          </td>
          <td
            onClick={firstChildHandleClick}
            style={{ cursor: firstChildCursorStyle }}
          >
            {children[0].name}
          </td>
          <td
            onClick={firstChildHandleClick}
            style={{ cursor: firstChildCursorStyle }}
          >
            {formatCount(getCount(children[0]))}
          </td>
          <td
            className="monospace"
            onClick={firstChildHandleClick}
            style={{ cursor: firstChildCursorStyle }}
          >
            {formatPercentage((getCount(children[0]) / total) * 100)}
          </td>
        </tr>
        {children.slice(1).map((child) => {
          const childIsAggregated = isAggregatedNode(child);
          const childClickable =
            (!isLeafNode(child) || childIsAggregated) && onVersionClick;
          const childHandleClick = childClickable
            ? () => onVersionClick(child.name, childIsAggregated)
            : undefined;
          const childCursorStyle = childClickable ? 'pointer' : 'default';

          return (
            <tr
              key={child.name}
              className={isEvenGroup ? 'row-group-even' : 'row-group-odd'}
            >
              <td
                onClick={childHandleClick}
                style={{ cursor: childCursorStyle }}
              >
                {child.name}
              </td>
              <td
                onClick={childHandleClick}
                style={{ cursor: childCursorStyle }}
              >
                {formatCount(getCount(child))}
              </td>
              <td
                className="monospace"
                onClick={childHandleClick}
                style={{ cursor: childCursorStyle }}
              >
                {formatPercentage((getCount(child) / total) * 100)}
              </td>
            </tr>
          );
        })}
      </>
    );
  } else {
    // No children - render only 3 cells for simple table
    const isClickable = (!isLeafNode(data) || isAggregated) && onVersionClick;
    const handleClick = isClickable
      ? () => onVersionClick!(data.name, isAggregated)
      : undefined;
    const cursorStyle = isClickable ? 'pointer' : 'default';

    return (
      <tr className={isEvenGroup ? 'row-group-even' : 'row-group-odd'}>
        <th onClick={handleClick} style={{ cursor: cursorStyle }}>
          {data.name}
        </th>
        <td onClick={handleClick} style={{ cursor: cursorStyle }}>
          {formatCount(count)}
        </td>
        <td
          className="monospace"
          onClick={handleClick}
          style={{ cursor: cursorStyle }}
        >
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
