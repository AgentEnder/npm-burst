import { area, line, scaleLinear, scalePoint } from 'd3';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronDown,
  ChevronRight,
  Github,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HealthMetricSeriesPoint } from '@npm-burst/github-data-access';
import {
  onRefreshHealthMetricsWithGitHubUserAccess,
  type PackageHealthResponse,
} from '../../server/functions/health.telefunc';
import {
  onGetHealthMetricSource,
  type MetricSourceData,
} from '../../server/functions/health-source.telefunc';
import { appStore } from '../store';
import { useSafeAuth } from '../context/auth-context';
import { useWarningToast } from '../hooks/use-warning-toast';
import { ChartDescription } from './chart-description';
import { Popover } from './popover';
import styles from './health-report.module.scss';

interface MetricDefinition {
  key: MetricKey;
  label: string;
  hint: string;
  getValue: (point: HealthMetricSeriesPoint) => number | null;
  formatValue: (value: number | null) => string;
}

type MetricKey =
  | 'issuesOpened30d'
  | 'issuesClosed30d'
  | 'openCloseRatio'
  | 'prsOpened30d'
  | 'prsMerged30d'
  | 'prsClosedUnmerged30d'
  | 'staleIssuesCount'
  | 'stalePrsCount';

const METRICS: MetricDefinition[] = [
  {
    key: 'issuesOpened30d',
    label: 'Issues Opened',
    hint: 'Created in the trailing 30-day window',
    getValue: (point) => point.issuesOpened30d,
    formatValue: (value) => `${value ?? 0}`,
  },
  {
    key: 'issuesClosed30d',
    label: 'Issues Closed',
    hint: 'Closed in the trailing 30-day window',
    getValue: (point) => point.issuesClosed30d,
    formatValue: (value) => `${value ?? 0}`,
  },
  {
    key: 'openCloseRatio',
    label: 'Open/Close Ratio',
    hint: 'Below 1.0 means closure is outpacing intake',
    getValue: (point) =>
      point.issuesOpened30d > 0
        ? point.issuesClosed30d / point.issuesOpened30d
        : null,
    formatValue: (value) => (value === null ? 'n/a' : `${value.toFixed(2)}x`),
  },
  {
    key: 'prsOpened30d',
    label: 'PRs Opened',
    hint: 'Opened in the trailing 30-day window',
    getValue: (point) => point.prsOpened30d,
    formatValue: (value) => `${value ?? 0}`,
  },
  {
    key: 'prsMerged30d',
    label: 'PRs Merged',
    hint: 'Merged in the trailing 30-day window',
    getValue: (point) => point.prsMerged30d,
    formatValue: (value) => `${value ?? 0}`,
  },
  {
    key: 'prsClosedUnmerged30d',
    label: 'PRs Closed Unmerged',
    hint: 'Closed without merge in the trailing 30-day window',
    getValue: (point) => point.prsClosedUnmerged30d,
    formatValue: (value) => `${value ?? 0}`,
  },
  {
    key: 'staleIssuesCount',
    label: 'Stale Issues',
    hint: 'Open issues inactive for more than 90 days',
    getValue: (point) => point.staleIssuesCount,
    formatValue: (value) => `${value ?? 0}`,
  },
  {
    key: 'stalePrsCount',
    label: 'Stale PRs',
    hint: 'Open pull requests inactive for more than 90 days',
    getValue: (point) => point.stalePrsCount,
    formatValue: (value) => `${value ?? 0}`,
  },
];

function formatHours(value: number | null): string {
  if (value === null) return 'n/a';
  if (value >= 72) return `${(value / 24).toFixed(1)}d`;
  if (value >= 1) return `${value.toFixed(1)}h`;
  return `${Math.round(value * 60)}m`;
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function Sparkline({
  points,
  metric,
}: {
  points: HealthMetricSeriesPoint[];
  metric: MetricDefinition;
}) {
  const values = points.map((point) => metric.getValue(point) ?? 0);
  const max = Math.max(...values, 1);
  const x = scalePoint<number>()
    .domain(values.map((_, index) => index))
    .range([0, 150]);
  const y = scaleLinear().domain([0, max]).range([32, 4]);
  const path = line<number>()
    .x((_, index) => x(index) ?? 0)
    .y((value) => y(value))(values);

  return (
    <svg
      className={styles.sparkline}
      viewBox="0 0 150 36"
      preserveAspectRatio="none"
    >
      <path d={path ?? ''} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function FullChart({
  points,
  metric,
}: {
  points: HealthMetricSeriesPoint[];
  metric: MetricDefinition;
}) {
  const width = 700;
  const height = 260;
  const margin = { top: 10, right: 12, bottom: 34, left: 44 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const values = points.map((point) => metric.getValue(point) ?? 0);
  const max = Math.max(...values, 1);
  const x = scalePoint<string>()
    .domain(points.map((point) => point.snapshotDate))
    .range([0, chartWidth]);
  const y = scaleLinear().domain([0, max]).nice().range([chartHeight, 0]);

  const linePath = line<HealthMetricSeriesPoint>()
    .x((point) => x(point.snapshotDate) ?? 0)
    .y((point) => y(metric.getValue(point) ?? 0))(points);

  const areaPath = area<HealthMetricSeriesPoint>()
    .x((point) => x(point.snapshotDate) ?? 0)
    .y0(chartHeight)
    .y1((point) => y(metric.getValue(point) ?? 0))(points);

  const ticks = y.ticks(4);

  return (
    <div className={styles.chart}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={metric.label}
      >
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {ticks.map((tick) => (
            <g key={tick} transform={`translate(0, ${y(tick)})`}>
              <line
                className={styles.gridLine}
                x1={0}
                x2={chartWidth}
                y1={0}
                y2={0}
              />
              <text className={styles.axisLabel} x={-8} y={4} textAnchor="end">
                {tick}
              </text>
            </g>
          ))}
          <path className={styles.area} d={areaPath ?? ''} />
          <path className={styles.line} d={linePath ?? ''} />
          {points.map((point) => (
            <g
              key={point.snapshotDate}
              transform={`translate(${x(point.snapshotDate) ?? 0}, 0)`}
            >
              <circle
                cy={y(metric.getValue(point) ?? 0)}
                r={3.5}
                fill="var(--accent-main)"
              />
              <text
                className={styles.axisLabel}
                y={chartHeight + 18}
                textAnchor="middle"
              >
                {formatDate(point.snapshotDate)}
              </text>
            </g>
          ))}
        </g>
      </svg>
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
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceData, setSourceData] = useState<MetricSourceData | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const latest = points[points.length - 1];
  const value = latest ? metric.getValue(latest) : null;

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

  return (
    <div className={styles.row}>
      <button
        className={styles.rowButton}
        onClick={() => setExpanded((current) => !current)}
      >
        <div className={styles.metricLabel}>
          <span className={styles.metricName}>{metric.label}</span>
          <span className={styles.metricHint}>{metric.hint}</span>
        </div>
        <div className={styles.metricValue}>{metric.formatValue(value)}</div>
        <Sparkline points={points} metric={metric} />
        <div className={styles.expandIcon}>
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </button>
      {expanded ? (
        <div className={styles.expanded}>
          <div className={styles.chartMeta}>
            <span>
              Latest snapshot:{' '}
              {latest ? formatDate(latest.snapshotDate) : 'n/a'}
            </span>
            <span>{metric.hint}</span>
          </div>
          <FullChart points={points} metric={metric} />
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
  const { isSignedIn, isAdmin } = useSafeAuth();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useWarningToast(
    `health:${health?.packageName ?? 'unknown'}`,
    health?.warnings ?? []
  );

  const canRefreshViaGitHub =
    isSignedIn && health?.githubUserAuthAvailable === true;

  const latestSnapshot =
    health && health.snapshots.length > 0
      ? health.snapshots[health.snapshots.length - 1]
      : null;

  const isStale = useMemo(() => {
    if (!latestSnapshot) return false;
    const snapshotTime = new Date(
      `${latestSnapshot.snapshotDate}T00:00:00`
    ).getTime();
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    return snapshotTime < twoDaysAgo;
  }, [latestSnapshot]);

  async function handleSync() {
    if (syncing || !health) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const refreshed = await onRefreshHealthMetricsWithGitHubUserAccess(
        health.packageName
      );
      const store = appStore.getState();
      store.setHealth(refreshed);
      store.cacheCurrentPackageData();
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : 'Failed to fetch GitHub health data.'
      );
    } finally {
      setSyncing(false);
    }
  }

  if (!health?.repo) {
    return (
      <div className={styles.emptyState}>
        <h2>No linked repository found</h2>
        <p>
          This package does not expose a GitHub repository in its npm metadata
          yet.
        </p>
      </div>
    );
  }

  if (!hasSnapshots) {
    if (health && !health.installationConfigured) {
      const repoPath = `${health.repo.owner}/${health.repo.name}`;

      return (
        <div className={styles.emptyState}>
          <div className={styles.frownWrap}>
            <svg
              className={styles.frownFace}
              viewBox="0 0 120 120"
              role="img"
              aria-label="Health data unavailable"
            >
              <circle className={styles.frownStroke} cx="60" cy="60" r="44" />
              <circle cx="44" cy="48" r="5" fill="currentColor" />
              <circle cx="76" cy="48" r="5" fill="currentColor" />
              <path
                className={styles.frownStroke}
                d="M38 84c6-8 16-12 22-12s16 4 22 12"
              />
            </svg>
            <h2>GitHub App authorization required</h2>
            <p>
              Automatic tracking still requires a maintainer to install the
              GitHub App for{' '}
              <a
                className={styles.repoLink}
                href={`https://github.com/${health.repo.owner}/${health.repo.name}`}
                target="_blank"
                rel="noreferrer"
              >
                {repoPath}
              </a>
              .
            </p>
            {isSignedIn ? (
              health.githubUserAuthAvailable ? (
                <>
                  <p>
                    You can still run a one-off snapshot for this repo using
                    your own connected GitHub account.
                  </p>
                  <button
                    className={styles.oauthActionButton}
                    onClick={handleSync}
                    disabled={syncing}
                  >
                    <Github size={16} />
                    {syncing
                      ? 'Fetching health data…'
                      : 'Fetch with my GitHub access'}
                  </button>
                </>
              ) : (
                <p>
                  Connect GitHub from{' '}
                  <a className={styles.repoLink} href="/usage">
                    Usage &amp; Tracking
                  </a>{' '}
                  to run a one-off snapshot as yourself.
                </p>
              )
            ) : (
              <p>
                Sign in and connect GitHub to run a one-off snapshot as
                yourself.
              </p>
            )}
            {syncError ? (
              <p className={styles.oauthError}>{syncError}</p>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div className={styles.emptyState}>
        <h2>Health snapshots aren&apos;t available yet</h2>
        <p>
          Repo detected at{' '}
          <a
            className={styles.repoLink}
            href={`https://github.com/${health.repo.owner}/${health.repo.name}`}
            target="_blank"
            rel="noreferrer"
          >
            {health.repo.owner}/{health.repo.name}
          </a>
          . Once the daily snapshot job captures data, this report will
          populate.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.report}>
      <ChartDescription>
        <p>GitHub repo health over time.</p>
        <ul>
          <li>Click a row to expand the full chart and source data</li>
        </ul>
      </ChartDescription>
      {warningMessage ? (
        <div className={styles.warningBanner}>{warningMessage}</div>
      ) : null}
      {(isStale || isAdmin) && canRefreshViaGitHub ? (
        <div className={styles.refreshBar}>
          <span className={styles.refreshStale}>
            Last snapshot:{' '}
            {latestSnapshot ? formatDate(latestSnapshot.snapshotDate) : 'n/a'}
          </span>
          <button
            className={styles.oauthActionButton}
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw size={14} />
            {syncing ? 'Refreshing…' : 'Refresh with GitHub'}
          </button>
          {syncError ? (
            <span className={styles.oauthError}>{syncError}</span>
          ) : null}
        </div>
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
            >
              {health.repo.owner}/{health.repo.name}
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
      <div className={styles.accordion}>
        {METRICS.map((metric) => (
          <MetricRow
            key={metric.key}
            metric={metric}
            points={health.snapshots}
            packageName={health.packageName}
          />
        ))}
      </div>
    </div>
  );
}
