import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { SiGithub } from '@icons-pack/react-simple-icons';
import { useEffect, useMemo, useState } from 'react';
import { areaY, defineChart, dot, lineY, ruleY } from '@tanstack/charts';
import { crosshair } from '@tanstack/charts/crosshair';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { tooltip } from '@tanstack/charts/tooltip';
import { createPortal } from 'react-dom';
import type { HealthMetricSeriesPoint } from '@npm-burst/github-data-access';
import type { PackageHealthResponse } from '../../server/functions/health.telefunc';
import {
  onGetHealthMetricSource,
  type HealthMetricKey,
  type MetricSourceData,
} from '../../server/functions/health-source.telefunc';
import { useSafeAuth } from '../context/auth-context';
import { useHealthRefresh } from '../hooks/use-health-refresh';
import { useWarningToast } from '../hooks/use-warning-toast';
import { HealthEmptyState } from './health-empty-state';
import { HealthEmptyShell } from './health-empty-shell';
import { Popover } from './popover';
import styles from './health-report.module.scss';

interface MetricVariant {
  id: string;
  /** Toggle label. */
  label: string;
  /** Shown in the expanded chart meta for this variant. */
  hint: string;
  getValue: (point: HealthMetricSeriesPoint) => number | null;
  formatValue: (value: number | null) => string;
  /**
   * Line colour. Follows the statistic, never the slot, so the same stat is
   * the same colour on every row it appears on.
   */
  color: string;
  /** Series is the change from the prior snapshot rather than the value itself. */
  delta?: boolean;
}

const ACCENT_COLOR = 'var(--accent-main)';
const STAT_COLORS = {
  avg: 'var(--chart-series-avg)',
  median: 'var(--chart-series-median)',
  p95: 'var(--chart-series-p95)',
} as const;

interface MetricDefinition {
  key: HealthMetricKey;
  label: string;
  /** Row subtitle. */
  hint: string;
  /** First is the default; a toggle renders when there is more than one. */
  variants: MetricVariant[];
}

interface MetricSection {
  title: string;
  metrics: MetricDefinition[];
}

function formatCount(value: number | null): string {
  if (value === null) return 'n/a';
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${value}`;
}

function formatSignedDelta(value: number | null): string {
  if (value === null) return 'n/a';
  if (value === 0) return '±0';
  const formatted = formatCount(Math.abs(value));
  return `${value > 0 ? '+' : '−'}${formatted}`;
}

function formatHours(value: number | null): string {
  if (value === null) return 'n/a';
  if (value < 1) return `${Math.round(value * 60)}m`;
  if (value < 48) return `${value.toFixed(value < 10 ? 1 : 0)}h`;
  const days = value / 24;
  return `${days.toFixed(days < 10 ? 1 : 0)}d`;
}

function countMetric(
  key: HealthMetricKey,
  label: string,
  hint: string,
  getValue: (point: HealthMetricSeriesPoint) => number | null,
  formatValue: (value: number | null) => string = (value) => `${value ?? 0}`
): MetricDefinition {
  return {
    key,
    label,
    hint,
    variants: [
      { id: 'value', label, hint, getValue, formatValue, color: ACCENT_COLOR },
    ],
  };
}

/** A running total: shown as-is, or as the change since the prior snapshot. */
function cumulativeMetric(
  key: HealthMetricKey,
  label: string,
  hint: string,
  getValue: (point: HealthMetricSeriesPoint) => number | null
): MetricDefinition {
  return {
    key,
    label,
    hint,
    variants: [
      {
        id: 'total',
        label: 'Total',
        hint,
        getValue,
        formatValue: formatCount,
        color: ACCENT_COLOR,
      },
      {
        id: 'delta',
        label: 'Δ',
        hint: `Change from prior snapshot — ${hint.toLowerCase()}`,
        getValue,
        formatValue: formatSignedDelta,
        color: ACCENT_COLOR,
        delta: true,
      },
    ],
  };
}

function durationMetric(
  key: HealthMetricKey,
  label: string,
  hint: string,
  stats: {
    avg?: (point: HealthMetricSeriesPoint) => number | null;
    median?: (point: HealthMetricSeriesPoint) => number | null;
    p95?: (point: HealthMetricSeriesPoint) => number | null;
  }
): MetricDefinition {
  const variants: MetricVariant[] = [];
  if (stats.avg) {
    variants.push({
      id: 'avg',
      label: 'Avg',
      hint: `Average — ${hint.toLowerCase()}`,
      getValue: stats.avg,
      formatValue: formatHours,
      color: STAT_COLORS.avg,
    });
  }
  if (stats.median) {
    variants.push({
      id: 'median',
      label: 'Median',
      hint: `Median — ${hint.toLowerCase()}`,
      getValue: stats.median,
      formatValue: formatHours,
      color: STAT_COLORS.median,
    });
  }
  if (stats.p95) {
    variants.push({
      id: 'p95',
      label: 'P95',
      hint: `95th percentile — ${hint.toLowerCase()}`,
      getValue: stats.p95,
      formatValue: formatHours,
      color: STAT_COLORS.p95,
    });
  }
  return { key, label, hint, variants };
}

const SECTIONS: MetricSection[] = [
  {
    title: 'Issues',
    metrics: [
      countMetric(
        'issuesOpened30d',
        'Issues Opened',
        'Created in the trailing 30-day window',
        (point) => point.issuesOpened30d
      ),
      countMetric(
        'issuesClosed30d',
        'Issues Closed',
        'Closed in the trailing 30-day window',
        (point) => point.issuesClosed30d
      ),
      countMetric(
        'openCloseRatio',
        'Close/Open Ratio',
        'Above 1.0 means open issues went down; below 1.0 means more were opened than closed',
        (point) =>
          point.issuesOpened30d > 0
            ? point.issuesClosed30d / point.issuesOpened30d
            : null,
        (value) => (value === null ? 'n/a' : `${value.toFixed(2)}x`)
      ),
      cumulativeMetric(
        'openIssuesCount',
        'Open Issues',
        'Total open issues on the repository',
        (point) => point.openIssuesCount
      ),
      countMetric(
        'staleIssuesCount',
        'Stale Issues',
        'Open issues inactive for more than 90 days',
        (point) => point.staleIssuesCount
      ),
      durationMetric(
        'issueBacklogAge',
        'Issue Backlog Age',
        'How long currently-open issues have been open',
        {
          avg: (point) => point.avgIssueAgeHours,
          p95: (point) => point.p95IssueAgeHours,
        }
      ),
      durationMetric(
        'issueResolutionTime',
        'Issue Resolution Time',
        'Time from opening to closing, for issues closed in the trailing 30 days',
        {
          avg: (point) => point.avgIssueCloseHours,
          median: (point) => point.medianIssueCloseHours,
          p95: (point) => point.p95IssueCloseHours,
        }
      ),
      durationMetric(
        'issueFirstResponse',
        'Issue First Response',
        'Median time to the first comment from someone other than the author, for issues opened in the trailing 30 days',
        { median: (point) => point.medianIssueFirstResponseHours }
      ),
    ],
  },
  {
    title: 'Pull Requests',
    metrics: [
      countMetric(
        'prsOpened30d',
        'PRs Opened',
        'Opened in the trailing 30-day window',
        (point) => point.prsOpened30d
      ),
      countMetric(
        'prsMerged30d',
        'PRs Merged',
        'Merged in the trailing 30-day window',
        (point) => point.prsMerged30d
      ),
      countMetric(
        'prsClosedUnmerged30d',
        'PRs Closed Unmerged',
        'Closed without merge in the trailing 30-day window',
        (point) => point.prsClosedUnmerged30d
      ),
      cumulativeMetric(
        'openPullRequestsCount',
        'Open PRs',
        'Total open pull requests on the repository',
        (point) => point.openPullRequestsCount
      ),
      countMetric(
        'stalePrsCount',
        'Stale PRs',
        'Open pull requests inactive for more than 90 days',
        (point) => point.stalePrsCount
      ),
      durationMetric(
        'prBacklogAge',
        'PR Backlog Age',
        'How long currently-open pull requests have been open',
        {
          avg: (point) => point.avgPrAgeHours,
          p95: (point) => point.p95PrAgeHours,
        }
      ),
      durationMetric(
        'prMergeTime',
        'PR Merge Time',
        'Time from opening to merging, for pull requests merged in the trailing 30 days',
        {
          avg: (point) => point.avgPrMergeHours,
          median: (point) => point.medianPrMergeHours,
          p95: (point) => point.p95PrMergeHours,
        }
      ),
      durationMetric(
        'prFirstReview',
        'PR First Review',
        'Median time to the first review from someone other than the author, for pull requests opened in the trailing 30 days',
        { median: (point) => point.medianPrFirstReviewHours }
      ),
    ],
  },
  {
    title: 'Other',
    metrics: [
      cumulativeMetric(
        'starsCount',
        'Stars',
        'Total stargazers on the repository',
        (point) => point.starsCount
      ),
      countMetric(
        'activeContributors30d',
        'Active Contributors',
        'Distinct people whose PRs merged in the trailing 30 days',
        (point) => point.activeContributors30d
      ),
    ],
  },
];

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface SeriesPoint {
  point: HealthMetricSeriesPoint;
  value: number;
}

/**
 * Null values are gaps, not zeros: a metric that did not exist yet (or could
 * not be computed) for a snapshot is left out rather than drawn as a cliff.
 */
function getSeries(
  points: HealthMetricSeriesPoint[],
  variant: MetricVariant
): SeriesPoint[] {
  const present: SeriesPoint[] = [];
  for (const point of points) {
    const value = variant.getValue(point);
    if (value !== null) present.push({ point, value });
  }
  if (!variant.delta) return present;

  const deltas: SeriesPoint[] = [];
  for (let i = 1; i < present.length; i += 1) {
    deltas.push({
      point: present[i].point,
      value: present[i].value - present[i - 1].value,
    });
  }
  return deltas;
}

function getHeadlineValue(
  points: HealthMetricSeriesPoint[],
  variant: MetricVariant
): number | null {
  const latest = points[points.length - 1];
  if (!latest) return null;
  if (!variant.delta) return variant.getValue(latest);
  const series = getSeries(points, variant);
  const last = series[series.length - 1];
  return last && last.point === latest ? last.value : null;
}

const SPARKLINE_HEIGHT = 38;

function Sparkline({
  points,
  variant,
}: {
  points: HealthMetricSeriesPoint[];
  variant: MetricVariant;
}) {
  const definition = useMemo(() => {
    const rows = getSeries(points, variant).map(({ value }, index) => ({
      index,
      value,
    }));
    if (rows.length === 0) return null;
    const values = rows.map(({ value }) => value);
    const yMin = Math.min(0, ...values);
    const yMax = Math.max(0, ...values, yMin === 0 ? 1 : 0);
    return defineChart({
      marks: [
        ...(yMin < 0 ? [ruleY([0], { stroke: 'var(--divider)' })] : []),
        lineY(rows, {
          x: 'index',
          y: 'value',
          stroke: 'currentColor',
          strokeWidth: 2,
        }),
      ],
      scales: {
        x: {
          scale: scalePoint<number>().domain(rows.map(({ index }) => index)),
        },
        y: { scale: scaleLinear().domain([yMin, yMax]) },
      },
      guides: false,

      // Vertical inset keeps the 2px stroke inside the box at the extremes.
      margin: { top: 4, right: 0, bottom: 4, left: 0 },
      focus: false,
      pointer: false,
      keyboard: false,
      tooltip: false,
    });
  }, [points, variant]);

  if (!definition) return <div className={styles.sparkline} />;
  return (
    <Chart
      className={styles.sparkline}
      definition={definition}
      height={SPARKLINE_HEIGHT}
      initialWidth={150}
      ariaLabel={`${variant.label} trend`}
    />
  );
}

/**
 * Every variant of the row on one plot, the selected one emphasised. Rows with
 * a Δ variant are the exception: a total and its change are different units,
 * so those draw only the selected series.
 */
function chartedVariants(
  metric: MetricDefinition,
  selected: MetricVariant
): MetricVariant[] {
  return metric.variants.some((variant) => variant.delta)
    ? [selected]
    : metric.variants;
}

const CHART_HEIGHT = 260;

interface ChartRow {
  date: string;
  value: number;
}

function FullChart({
  points,
  metric,
  selected,
  onSelect,
}: {
  points: HealthMetricSeriesPoint[];
  metric: MetricDefinition;
  selected: MetricVariant;
  onSelect: (variantId: string) => void;
}) {
  const variants = chartedVariants(metric, selected);

  const definition = useMemo(() => {
    const charted = chartedVariants(metric, selected).map((variant) => ({
      variant,
      rows: getSeries(points, variant).map(
        ({ point, value }): ChartRow => ({ date: point.snapshotDate, value })
      ),
    }));
    // Snapshots any drawn series has a value for, in order.
    const dates = points
      .map((point) => point.snapshotDate)
      .filter((date) =>
        charted.some(({ rows }) => rows.some((row) => row.date === date))
      );
    const values = charted.flatMap(({ rows }) =>
      rows.map(({ value }) => value)
    );
    const yMin = Math.min(0, ...values);
    const yMax = Math.max(0, ...values, yMin === 0 ? 1 : 0);
    const lastDate = dates[dates.length - 1];

    // Unselected series first so the selected one paints on top.
    const drawOrder = [...charted].sort((a) =>
      a.variant.id === selected.id ? 1 : -1
    );
    const marks = drawOrder.flatMap(({ variant, rows }) => {
      const isSelected = variant.id === selected.id;
      const color = variant.color;
      return [
        ...(isSelected
          ? [
              decorative(
                areaY(rows, {
                  id: `${variant.id}-area`,
                  x: 'date',
                  y: 'value',
                  y1: 0,
                  fill: color,
                  fillOpacity: 0.14,
                })
              ),
            ]
          : []),
        decorative(
          lineY(rows, {
            id: `${variant.id}-line`,
            x: 'date',
            y: 'value',
            stroke: color,
            strokeWidth: isSelected ? 2.5 : 1.5,
          })
        ),
        dot(rows, {
          id: variant.id,
          x: 'date',
          y: 'value',
          key: 'date',
          r: isSelected ? 3.5 : 2.5,
          fill: color,
          // Surface ring keeps overlapping series separable.
          stroke: 'var(--surface-1)',
          strokeWidth: 2,
          states: [{ when: { focus: 'x' }, style: { r: 5 } }],
        }),
      ];
    });

    return defineChart({
      marks: [
        crosshair({
          x: {
            stroke: 'var(--text-tertiary)',
            strokeOpacity: 1,
            strokeDasharray: '3 3',
          },
          y: false,
        }),
        ...marks,
      ],
      scales: {
        x: {
          scale: scalePoint<string>().domain(dates),
          axis: {
            line: false,
            ticks: { values: dates, size: 0, format: formatDate },
            tickLabels: {
              // Pin the ends inward so they stay inside the plot.
              anchor: ({ index }) =>
                dates.length <= 1
                  ? 'middle'
                  : index === 0
                  ? 'start'
                  : index === dates.length - 1
                  ? 'end'
                  : 'middle',
              thin: { priority: 'ends', keep: lastDate ? [lastDate] : [] },
            },
          },
        },
        y: {
          scale: scaleLinear().domain([yMin, yMax]),
          nice: 4,
          grid: { stroke: 'var(--divider)', strokeOpacity: 1, strokeWidth: 1 },
          axis: {
            line: false,
            ticks: { count: 4, size: 0, format: selected.formatValue },
          },
        },
      },
      margin: { top: 10, right: 16 },
      focus: 'group-x',
      focusRing: false,
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: {
        use: tooltip,
        content: (focused) => {
          const date = focused[0]?.datum.date;
          if (date === undefined) return { rows: [] };
          return {
            title: formatDate(date),
            rows: charted.map(({ variant, rows }) => ({
              label: variant.label,
              value: variant.formatValue(
                rows.find((row) => row.date === date)?.value ?? null
              ),
              color: variant.color,
              active: variant.id === selected.id,
            })),
          };
        },
      },
    });
  }, [points, metric, selected]);

  return (
    <div className={styles.chart}>
      <Chart
        className={styles.plot}
        definition={definition}
        height={CHART_HEIGHT}
        initialWidth={700}
        ariaLabel={metric.label}
      />
      {variants.length > 1 ? (
        <div className={styles.legend} role="group" aria-label="Series">
          {variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              className={`${styles.legendItem} ${
                variant.id === selected.id ? styles.legendItemActive : ''
              }`}
              aria-pressed={variant.id === selected.id}
              onClick={() => onSelect(variant.id)}
            >
              <span
                className={styles.legendSwatch}
                style={{ background: variant.color }}
              />
              <span>{variant.label}</span>
              <span className={styles.legendValue}>
                {variant.formatValue(getHeadlineValue(points, variant))}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function isUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
}

function renderJsonValue(value: unknown): React.ReactNode {
  if (typeof value === 'string') {
    if (isUrl(value)) {
      return (
        <a
          className={styles.jsonLink}
          href={value}
          target="_blank"
          rel="noreferrer"
        >
          "{value}"
        </a>
      );
    }
    return <span className={styles.jsonString}>"{value}"</span>;
  }
  if (typeof value === 'number') {
    return <span className={styles.jsonNumber}>{value}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className={styles.jsonBoolean}>{String(value)}</span>;
  }
  if (value === null) {
    return <span className={styles.jsonNull}>null</span>;
  }
  return null;
}

function renderJsonNode(
  value: unknown,
  indent = 0,
  key?: string,
  path = 'root'
): React.ReactNode[] {
  const pad = '  '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [
        <div className={styles.jsonLine} key={`${path}-empty-array`}>
          {pad}
          {key ? <span className={styles.jsonKey}>"{key}"</span> : null}
          {key ? ': ' : null}
          []
        </div>,
      ];
    }

    const lines: React.ReactNode[] = [
      <div className={styles.jsonLine} key={`${path}-open-array`}>
        {pad}
        {key ? <span className={styles.jsonKey}>"{key}"</span> : null}
        {key ? ': [' : '['}
      </div>,
    ];

    value.forEach((item, index) => {
      const nested = renderJsonNode(
        item,
        indent + 1,
        undefined,
        `${path}[${index}]`
      );
      if (nested.length > 0) {
        const last = nested[nested.length - 1] as React.ReactElement<{
          children: React.ReactNode;
        }>;
        nested[nested.length - 1] = (
          <div className={styles.jsonLine} key={`${path}[${index}]-tail`}>
            {last.props.children}
            {index < value.length - 1 ? ',' : ''}
          </div>
        );
      }
      lines.push(...nested);
    });

    lines.push(
      <div className={styles.jsonLine} key={`${path}-close-array`}>
        {pad}]
      </div>
    );
    return lines;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return [
        <div className={styles.jsonLine} key={`${path}-empty-object`}>
          {pad}
          {key ? <span className={styles.jsonKey}>"{key}"</span> : null}
          {key ? ': ' : null}
          {'{}'}
        </div>,
      ];
    }

    const lines: React.ReactNode[] = [
      <div className={styles.jsonLine} key={`${path}-open-object`}>
        {pad}
        {key ? <span className={styles.jsonKey}>"{key}"</span> : null}
        {key ? ': {' : '{'}
      </div>,
    ];

    entries.forEach(([entryKey, entryValue], index) => {
      const nested = renderJsonNode(
        entryValue,
        indent + 1,
        entryKey,
        `${path}.${entryKey}`
      );
      if (nested.length > 0) {
        const last = nested[nested.length - 1] as React.ReactElement<{
          children: React.ReactNode;
        }>;
        nested[nested.length - 1] = (
          <div className={styles.jsonLine} key={`${path}.${entryKey}-tail`}>
            {last.props.children}
            {index < entries.length - 1 ? ',' : ''}
          </div>
        );
      }
      lines.push(...nested);
    });

    lines.push(
      <div className={styles.jsonLine} key={`${path}-close-object`}>
        {pad}
        {'}'}
      </div>
    );
    return lines;
  }

  return [
    <div className={styles.jsonLine} key={`${path}-value`}>
      {pad}
      {key ? <span className={styles.jsonKey}>"{key}"</span> : null}
      {key ? ': ' : null}
      {renderJsonValue(value)}
    </div>,
  ];
}

function SourceDataContent({
  sourceData,
}: {
  sourceData: MetricSourceData | null;
}) {
  if (!sourceData) {
    return <pre className={styles.sourcePre}>No source data available.</pre>;
  }

  return <div className={styles.sourceJson}>{renderJsonNode(sourceData)}</div>;
}

function MetricRow({
  metric,
  points,
  packageName,
}: {
  metric: MetricDefinition;
  points: HealthMetricSeriesPoint[];
  packageName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [variantId, setVariantId] = useState(metric.variants[0].id);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceData, setSourceData] = useState<MetricSourceData | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const latest = points[points.length - 1];
  const variant =
    metric.variants.find((candidate) => candidate.id === variantId) ??
    metric.variants[0];
  const showToggle = metric.variants.length > 1;
  const headlineValue = variant.formatValue(getHeadlineValue(points, variant));

  useEffect(() => {
    if (!showSourceModal) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSourceModal(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSourceModal]);

  const handleSourceToggle = async () => {
    setShowSourceModal(true);
    if (sourceData || sourceLoading) return;

    setSourceLoading(true);
    setSourceError(null);
    try {
      const source = await onGetHealthMetricSource(packageName, metric.key);
      setSourceData(source);
    } catch {
      setSourceError('Failed to load source data.');
    } finally {
      setSourceLoading(false);
    }
  };

  const handleCopySource = async () => {
    if (!sourceData) return;
    await navigator.clipboard.writeText(formatJson(sourceData));
  };

  const handleDownloadSource = () => {
    if (!sourceData) return;
    const blob = new Blob([formatJson(sourceData)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${packageName}-${metric.key}-source.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpanded = () => setExpanded((current) => !current);

  return (
    <div className={styles.row}>
      <div
        role="button"
        tabIndex={0}
        className={styles.rowButton}
        onClick={toggleExpanded}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleExpanded();
          }
        }}
      >
        <div className={styles.metricLabel}>
          <span className={styles.metricName}>{metric.label}</span>
          <span className={styles.metricHint}>{metric.hint}</span>
        </div>
        <div className={styles.metricValue}>{headlineValue}</div>
        <div className={styles.sparklineCell}>
          {showToggle ? (
            <div
              className={styles.modeToggle}
              onClick={(event) => event.stopPropagation()}
            >
              {metric.variants.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className={`${styles.modeToggleButton} ${
                    candidate.id === variant.id
                      ? styles.modeToggleButtonActive
                      : ''
                  }`}
                  onClick={() => setVariantId(candidate.id)}
                  aria-pressed={candidate.id === variant.id}
                >
                  {candidate.label}
                </button>
              ))}
            </div>
          ) : null}
          <Sparkline points={points} variant={variant} />
        </div>
        <div className={styles.expandIcon}>
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </div>
      {expanded ? (
        <div className={styles.expanded}>
          <div className={styles.chartMeta}>
            <span>
              Latest snapshot:{' '}
              {latest ? formatDate(latest.snapshotDate) : 'n/a'}
            </span>
            <span>{variant.hint}</span>
          </div>
          <FullChart
            points={points}
            metric={metric}
            selected={variant}
            onSelect={setVariantId}
          />
          <div className={styles.actions}>
            <button
              className={styles.sourceButton}
              onClick={handleSourceToggle}
            >
              View source data
            </button>
          </div>
        </div>
      ) : null}
      {showSourceModal && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={styles.modalOverlay}
              onClick={() => setShowSourceModal(false)}
            >
              <div
                className={styles.modal}
                onClick={(event) => event.stopPropagation()}
              >
                <div className={styles.modalHeader}>
                  <div>
                    <h3 className={styles.modalTitle}>
                      {metric.label} source data
                    </h3>
                    <p className={styles.modalMeta}>
                      Latest snapshot:{' '}
                      {latest ? formatDate(latest.snapshotDate) : 'n/a'}
                    </p>
                  </div>
                  <button
                    className={styles.modalClose}
                    onClick={() => setShowSourceModal(false)}
                  >
                    Close
                  </button>
                </div>
                <div className={`${styles.modalBody} ${styles.sourceBlock}`}>
                  {!sourceLoading && !sourceError && sourceData ? (
                    <div className={styles.sourceToolbar}>
                      <button
                        className={styles.sourceToolbarButton}
                        onClick={handleCopySource}
                      >
                        Copy JSON
                      </button>
                      <button
                        className={styles.sourceToolbarButton}
                        onClick={handleDownloadSource}
                      >
                        Download JSON
                      </button>
                    </div>
                  ) : null}
                  {sourceLoading ? (
                    <pre className={styles.sourcePre}>
                      Loading source data...
                    </pre>
                  ) : sourceError ? (
                    <pre className={styles.sourcePre}>{sourceError}</pre>
                  ) : (
                    <SourceDataContent sourceData={sourceData} />
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export function HealthReport({
  health,
}: {
  health: PackageHealthResponse | null;
}) {
  const hasSnapshots = (health?.snapshots.length ?? 0) > 0;
  const warningMessage =
    health && health.warnings.length > 0
      ? 'Some GitHub or npm data could not be loaded, so this report may be partial.'
      : null;
  const { isSignedIn } = useSafeAuth();
  const {
    syncing,
    error: syncError,
    authPending,
    refresh,
    connectGitHub,
    signIn,
  } = useHealthRefresh(health?.githubUserAuthAvailable === true);

  useWarningToast(
    `health:${health?.packageName ?? 'unknown'}`,
    health?.warnings ?? []
  );

  const latestSnapshot =
    health && health.snapshots.length > 0
      ? health.snapshots[health.snapshots.length - 1]
      : null;

  if (!health?.repo) {
    // Listing a repo we can't read is a different situation from listing none
    // at all — one will never be trackable here, the other might be later.
    if (health?.externalRepo) {
      return (
        <HealthEmptyShell
          title={`Hosted on ${health.externalRepo.host}`}
          tone="missing"
          body={`This package's repository is on ${health.externalRepo.host}. Health reporting reads issue and pull request activity through the GitHub API, so there's nothing to track here.`}
          actions={
            <a
              className={styles.secondaryAction}
              href={health.externalRepo.url}
              target="_blank"
              rel="noreferrer"
            >
              View the repository on {health.externalRepo.host}
            </a>
          }
        />
      );
    }

    return (
      <HealthEmptyShell
        title="No linked repository"
        tone="missing"
        body="This package doesn't list a repository in its npm metadata, so there is nothing to track yet."
      />
    );
  }

  if (!hasSnapshots) {
    if (health && !health.installationConfigured) {
      return (
        <HealthEmptyState
          packageName={health.packageName}
          repo={health.repo}
          appInstalled={false}
          isSignedIn={isSignedIn === true}
          githubLinked={health.githubUserAuthAvailable === true}
          authPending={authPending}
          syncing={syncing}
          syncError={syncError}
          onSnapshot={() => refresh(health.packageName)}
          onSignIn={signIn}
          onConnectGitHub={connectGitHub}
        />
      );
    }

    return (
      <HealthEmptyState
        packageName={health.packageName}
        repo={health.repo}
        appInstalled
        isSignedIn={isSignedIn === true}
        githubLinked={health.githubUserAuthAvailable === true}
        authPending={authPending}
        syncing={syncing}
        syncError={syncError}
        onSnapshot={() => refresh(health.packageName)}
        onSignIn={signIn}
        onConnectGitHub={connectGitHub}
      />
    );
  }

  return (
    <div className={styles.report}>
      {warningMessage ? (
        <div className={styles.warningBanner}>{warningMessage}</div>
      ) : null}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Repository</span>
          <span
            className={`${styles.summaryValue} ${styles.summaryValueCompact}`}
          >
            <a
              className={styles.repoLink}
              href={`https://github.com/${health.repo.owner}/${health.repo.name}`}
              target="_blank"
              rel="noreferrer"
              title={`${health.repo.owner}/${health.repo.name}`}
            >
              <SiGithub size={13} />
              <span className={styles.repoLinkName}>
                {health.repo.owner}/{health.repo.name}
              </span>
            </a>
          </span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Issue Throughput</span>
          {health.snapshots.length > 0 ? (
            <span
              className={`${styles.summaryValue} ${styles.summaryFraction}`}
            >
              <Popover
                content="Issues closed in the trailing 30 days."
                trigger="hover"
                position="below"
              >
                <span
                  className={styles.summaryIconStat}
                  aria-label="Issues closed in the trailing 30 days"
                >
                  <ArrowDownCircle size={18} />
                  <span>
                    {
                      health.snapshots[health.snapshots.length - 1]
                        .issuesClosed30d
                    }
                  </span>
                </span>
              </Popover>
              <span className={styles.summaryDivider}>/</span>
              <Popover
                content="Issues opened in the trailing 30 days."
                trigger="hover"
                position="below"
              >
                <span
                  className={styles.summaryIconStat}
                  aria-label="Issues opened in the trailing 30 days"
                >
                  <ArrowUpCircle size={18} />
                  <span>
                    {
                      health.snapshots[health.snapshots.length - 1]
                        .issuesOpened30d
                    }
                  </span>
                </span>
              </Popover>
            </span>
          ) : (
            <span className={styles.summaryValue}>n/a</span>
          )}
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Stale Issues</span>
          <span className={`${styles.summaryValue} ${styles.summaryFraction}`}>
            <Popover
              content="Open issues inactive for more than 90 days."
              trigger="hover"
              position="below"
            >
              <span
                className={styles.summaryIconStat}
                aria-label="Stale issues"
              >
                <span>
                  {latestSnapshot ? latestSnapshot.staleIssuesCount : 'n/a'}
                </span>
              </span>
            </Popover>
          </span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Stale PRs</span>
          <span className={`${styles.summaryValue} ${styles.summaryFraction}`}>
            <Popover
              content="Open pull requests inactive for more than 90 days."
              trigger="hover"
              position="below"
            >
              <span
                className={styles.summaryIconStat}
                aria-label="Stale pull requests"
              >
                <span>
                  {latestSnapshot ? latestSnapshot.stalePrsCount : 'n/a'}
                </span>
              </span>
            </Popover>
          </span>
        </div>
      </div>
      {SECTIONS.map((section) => (
        <section key={section.title} className={styles.section}>
          <h3 className={styles.sectionTitle}>{section.title}</h3>
          <div className={styles.accordion}>
            {section.metrics.map((metric) => (
              <MetricRow
                key={metric.key}
                metric={metric}
                points={health.snapshots}
                packageName={health.packageName}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
