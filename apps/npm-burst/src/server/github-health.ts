import {
  canonicalizeFilterConfig,
  parseFilterConfig,
  parseGitHubRepositoryUrl,
  type FilterConfig,
  type HealthMetricSeriesPoint,
  type RawGitHubHealthData,
} from '@npm-burst/github-data-access';
import type { Kysely } from 'kysely';
import { decompressJson } from '@npm-burst/shared';
import type { DB } from './db-schema';
import { logExternalFailure } from './external-data';
import {
  getFixtureHealthMetrics,
  getFixtureHealthRepo,
} from './fixtures/packages';
import { ensureTrackedPackageMetadata } from './package-metadata';
import { cachedFetch } from './npm-fetch';

export interface ResolvedRepoInfo {
  id: number;
  installationId: number | null;
  owner: string;
  name: string;
  filterConfig: FilterConfig | null;
}

export interface PackageHealthData {
  packageName: string;
  installationConfigured: boolean;
  repo: { owner: string; name: string } | null;
  filterConfig: FilterConfig | null;
  snapshots: HealthMetricSeriesPoint[];
}

export type HealthMetricKey =
  | 'issuesOpened30d'
  | 'issuesClosed30d'
  | 'openCloseRatio'
  | 'medianIssueFirstResponseHours'
  | 'medianIssueCloseHours'
  | 'prsOpened30d'
  | 'prsMerged30d'
  | 'prsClosedUnmerged30d'
  | 'medianPrFirstReviewHours'
  | 'medianPrMergeHours'
  | 'activeContributors30d'
  | 'staleIssuesCount'
  | 'stalePrsCount'
  | 'openIssuesCount'
  | 'openPullRequestsCount'
  | 'starsCount';

export interface MetricSourceData {
  metricKey: HealthMetricKey;
  snapshotDate: string;
  repo: { owner: string; name: string };
  summary: Record<string, unknown>;
  entries: Record<string, unknown>[];
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function toMetricPoint(row: {
  snapshot_date: string;
  issues_opened_30d: number;
  issues_closed_30d: number;
  prs_opened_30d: number;
  prs_merged_30d: number;
  prs_closed_unmerged_30d: number;
  median_issue_first_response_hours: number | null;
  median_issue_close_hours: number | null;
  median_pr_first_review_hours: number | null;
  median_pr_merge_hours: number | null;
  active_contributors_30d: number;
  stale_issues_count: number;
  stale_prs_count: number;
  open_issues_count: number;
  open_pull_requests_count: number;
  stars_count: number;
}): HealthMetricSeriesPoint {
  return {
    snapshotDate: row.snapshot_date,
    issuesOpened30d: row.issues_opened_30d,
    issuesClosed30d: row.issues_closed_30d,
    prsOpened30d: row.prs_opened_30d,
    prsMerged30d: row.prs_merged_30d,
    prsClosedUnmerged30d: row.prs_closed_unmerged_30d,
    medianIssueFirstResponseHours: row.median_issue_first_response_hours,
    medianIssueCloseHours: row.median_issue_close_hours,
    medianPrFirstReviewHours: row.median_pr_first_review_hours,
    medianPrMergeHours: row.median_pr_merge_hours,
    activeContributors30d: row.active_contributors_30d,
    staleIssuesCount: row.stale_issues_count,
    stalePrsCount: row.stale_prs_count,
    openIssuesCount: row.open_issues_count,
    openPullRequestsCount: row.open_pull_requests_count,
    starsCount: row.stars_count,
  };
}

function matchesFilter(
  labels: string[],
  filterConfig: FilterConfig | null
): boolean {
  const wantedLabels = filterConfig?.labels;
  if (!wantedLabels || wantedLabels.length === 0) return true;
  return wantedLabels.every((label) => labels.includes(label));
}

function getSourceNow(snapshotDate: string): Date {
  return new Date(`${snapshotDate}T23:59:59.000Z`);
}

function buildMetricSourceData(
  metricKey: HealthMetricKey,
  snapshotDate: string,
  repo: { owner: string; name: string },
  rawData: RawGitHubHealthData,
  filterConfig: FilterConfig | null
): MetricSourceData {
  const now = getSourceNow(snapshotDate);
  const sinceMs = now.getTime() - 30 * DAY_IN_MS;
  const staleCutoff = now.getTime() - 90 * DAY_IN_MS;
  const repoUrl = `https://github.com/${repo.owner}/${repo.name}`;
  const issues = rawData.repository.issues.filter((issue) =>
    matchesFilter(issue.labels, filterConfig)
  );
  const prs = rawData.repository.pullRequests.filter((pr) =>
    matchesFilter(pr.labels, filterConfig)
  );

  switch (metricKey) {
    case 'issuesOpened30d': {
      const entries = issues
        .filter((issue) => new Date(issue.createdAt).getTime() >= sinceMs)
        .map((issue) => ({
          ...issue,
          url: `${repoUrl}/issues/${issue.number}`,
        }));
      return {
        metricKey,
        snapshotDate,
        repo,
        summary: { count: entries.length },
        entries,
      };
    }
    case 'issuesClosed30d': {
      const entries = issues
        .filter(
          (issue) =>
            issue.closedAt && new Date(issue.closedAt).getTime() >= sinceMs
        )
        .map((issue) => ({
          ...issue,
          url: `${repoUrl}/issues/${issue.number}`,
        }));
      return {
        metricKey,
        snapshotDate,
        repo,
        summary: { count: entries.length },
        entries,
      };
    }
    case 'openCloseRatio': {
      const opened = issues.filter(
        (issue) => new Date(issue.createdAt).getTime() >= sinceMs
      );
      const closed = issues.filter(
        (issue) =>
          issue.closedAt && new Date(issue.closedAt).getTime() >= sinceMs
      );
      return {
        metricKey,
        snapshotDate,
        repo,
        summary: {
          issuesOpened30d: opened.length,
          issuesClosed30d: closed.length,
          ratio:
            opened.length > 0
              ? Number((closed.length / opened.length).toFixed(2))
              : null,
        },
        entries: [
          ...opened.map((issue) => ({
            group: 'opened',
            ...issue,
            url: `${repoUrl}/issues/${issue.number}`,
          })),
          ...closed.map((issue) => ({
            group: 'closed',
            ...issue,
            url: `${repoUrl}/issues/${issue.number}`,
          })),
        ],
      };
    }
    case 'prsOpened30d': {
      const entries = prs
        .filter((pr) => new Date(pr.createdAt).getTime() >= sinceMs)
        .map((pr) => ({
          ...pr,
          url: `${repoUrl}/pull/${pr.number}`,
        }));
      return {
        metricKey,
        snapshotDate,
        repo,
        summary: { count: entries.length },
        entries,
      };
    }
    case 'prsMerged30d': {
      const entries = prs
        .filter(
          (pr) => pr.mergedAt && new Date(pr.mergedAt).getTime() >= sinceMs
        )
        .map((pr) => ({
          ...pr,
          url: `${repoUrl}/pull/${pr.number}`,
        }));
      return {
        metricKey,
        snapshotDate,
        repo,
        summary: { count: entries.length },
        entries,
      };
    }
    case 'prsClosedUnmerged30d': {
      const entries = prs
        .filter(
          (pr) =>
            pr.closedAt &&
            !pr.mergedAt &&
            new Date(pr.closedAt).getTime() >= sinceMs
        )
        .map((pr) => ({
          ...pr,
          url: `${repoUrl}/pull/${pr.number}`,
        }));
      return {
        metricKey,
        snapshotDate,
        repo,
        summary: { count: entries.length },
        entries,
      };
    }
    case 'staleIssuesCount': {
      const entries = issues
        .filter(
          (issue) =>
            !issue.closedAt && new Date(issue.updatedAt).getTime() < staleCutoff
        )
        .map((issue) => ({
          ...issue,
          url: `${repoUrl}/issues/${issue.number}`,
        }));
      return {
        metricKey,
        snapshotDate,
        repo,
        summary: { count: entries.length },
        entries,
      };
    }
    case 'stalePrsCount': {
      const entries = prs
        .filter(
          (pr) =>
            !pr.closedAt &&
            !pr.mergedAt &&
            new Date(pr.updatedAt).getTime() < staleCutoff
        )
        .map((pr) => ({
          ...pr,
          url: `${repoUrl}/pull/${pr.number}`,
        }));
      return {
        metricKey,
        snapshotDate,
        repo,
        summary: { count: entries.length },
        entries,
      };
    }
    default:
      return {
        metricKey,
        snapshotDate,
        repo,
        summary: {},
        entries: [],
      };
  }
}

async function getExistingRepoForPackage(
  db: Kysely<DB>,
  packageName: string
): Promise<ResolvedRepoInfo | null> {
  const row = await db
    .selectFrom('github_repo_packages as grp')
    .innerJoin('github_repos as gr', 'gr.id', 'grp.repo_id')
    .select([
      'gr.id as id',
      'gr.installation_id as installation_id',
      'gr.owner as owner',
      'gr.name as name',
      'grp.filter_config as filter_config',
    ])
    .where('grp.package_name', '=', packageName)
    .orderBy('grp.is_maintainer_override', 'desc')
    .$narrowType<{ id: number }>()
    .executeTakeFirst();

  if (!row) return null;
  return {
    id: row.id,
    installationId: row.installation_id,
    owner: row.owner,
    name: row.name,
    filterConfig: parseFilterConfig(row.filter_config),
  };
}

export async function ensureGitHubRepoForPackage(
  db: Kysely<DB>,
  packageName: string
): Promise<ResolvedRepoInfo | null> {
  const existing = await getExistingRepoForPackage(db, packageName);
  if (existing) return existing;

  const trackedRow = await db
    .selectFrom('tracked_packages')
    .select('id')
    .where('package_name', '=', packageName)
    .executeTakeFirst();

  let resolvedRepo = trackedRow
    ? (await ensureTrackedPackageMetadata(db, packageName)).githubRepo
    : null;
  if (!resolvedRepo) {
    let body: string;
    try {
      body = await cachedFetch(
        db,
        `https://registry.npmjs.org/${encodeURIComponent(packageName)}`
      );
    } catch (error) {
      logExternalFailure(
        { source: 'npm', operation: 'resolve package GitHub repository' },
        error,
        { packageName }
      );
      return null;
    }

    let repository: unknown = null;
    try {
      repository = (JSON.parse(body) as { repository?: unknown }).repository;
    } catch {
      return null;
    }

    resolvedRepo = parseGitHubRepositoryUrl(repository);
  }

  const parsedRepo = resolvedRepo;
  if (!parsedRepo) return null;

  const installation = await db
    .selectFrom('github_installations')
    .select('id')
    .where('owner', '=', parsedRepo.owner)
    .$narrowType<{ id: number }>()
    .executeTakeFirst();

  await db
    .insertInto('github_repos')
    .values({
      installation_id: installation?.id ?? null,
      owner: parsedRepo.owner,
      name: parsedRepo.name,
    })
    .onConflict((oc) => oc.columns(['owner', 'name']).doNothing())
    .execute();

  const repo = await db
    .selectFrom('github_repos')
    .select(['id', 'installation_id', 'owner', 'name'])
    .where('owner', '=', parsedRepo.owner)
    .where('name', '=', parsedRepo.name)
    .$narrowType<{ id: number }>()
    .executeTakeFirst();

  if (!repo) return null;

  await db
    .insertInto('github_repo_packages')
    .values({
      repo_id: repo.id,
      package_name: packageName,
      filter_config: null,
      is_maintainer_override: 0,
    })
    .onConflict((oc) => oc.columns(['repo_id', 'package_name']).doNothing())
    .execute();

  return {
    id: repo.id,
    installationId: repo.installation_id,
    owner: repo.owner,
    name: repo.name,
    filterConfig: null,
  };
}

export async function getPackageHealthData(
  db: Kysely<DB>,
  packageName: string
): Promise<PackageHealthData> {
  const repo = await ensureGitHubRepoForPackage(db, packageName);

  if (!repo) {
    return {
      packageName,
      installationConfigured: false,
      repo: null,
      filterConfig: null,
      snapshots: [],
    };
  }

  const rows = await db
    .selectFrom('github_health_metrics as ghm')
    .innerJoin('github_health_snapshots as ghs', 'ghs.id', 'ghm.snapshot_id')
    .select([
      'ghm.filter_config as filter_config',
      'ghs.snapshot_date as snapshot_date',
      'ghm.issues_opened_30d as issues_opened_30d',
      'ghm.issues_closed_30d as issues_closed_30d',
      'ghm.prs_opened_30d as prs_opened_30d',
      'ghm.prs_merged_30d as prs_merged_30d',
      'ghm.prs_closed_unmerged_30d as prs_closed_unmerged_30d',
      'ghm.median_issue_first_response_hours as median_issue_first_response_hours',
      'ghm.median_issue_close_hours as median_issue_close_hours',
      'ghm.median_pr_first_review_hours as median_pr_first_review_hours',
      'ghm.median_pr_merge_hours as median_pr_merge_hours',
      'ghm.active_contributors_30d as active_contributors_30d',
      'ghm.stale_issues_count as stale_issues_count',
      'ghm.stale_prs_count as stale_prs_count',
      'ghm.open_issues_count as open_issues_count',
      'ghm.open_pull_requests_count as open_pull_requests_count',
      'ghm.stars_count as stars_count',
    ])
    .where('ghm.repo_id', '=', repo.id)
    .orderBy('ghs.snapshot_date', 'asc')
    .execute();

  const wantedFilter = canonicalizeFilterConfig(repo.filterConfig);
  const exactMatch = rows.filter((row) => row.filter_config === wantedFilter);
  const fallback = rows.filter((row) => row.filter_config === null);
  const selected = exactMatch.length > 0 ? exactMatch : fallback;

  return {
    packageName,
    installationConfigured: repo.installationId !== null,
    repo: { owner: repo.owner, name: repo.name },
    filterConfig: repo.filterConfig,
    snapshots: selected.map(toMetricPoint),
  };
}

export async function getPackageMetricSource(
  db: Kysely<DB>,
  packageName: string,
  metricKey: HealthMetricKey
): Promise<MetricSourceData | null> {
  const repo = await ensureGitHubRepoForPackage(db, packageName);
  if (!repo) return null;

  const latestSnapshot = await db
    .selectFrom('github_health_snapshots')
    .select(['id', 'snapshot_date', 'raw_data'])
    .where('repo_id', '=', repo.id)
    .orderBy('snapshot_date', 'desc')
    .executeTakeFirst();

  if (!latestSnapshot) return null;

  if (metricKey === 'staleIssuesCount' || metricKey === 'stalePrsCount') {
    const wantedFilter = canonicalizeFilterConfig(repo.filterConfig);
    const parsedFilter = parseFilterConfig(wantedFilter);
    const metricRows = await db
      .selectFrom('github_health_metrics')
      .select(['filter_config', 'stale_issues_count', 'stale_prs_count'])
      .where('snapshot_id', '=', latestSnapshot.id)
      .where('repo_id', '=', repo.id)
      .execute();

    const exact = metricRows.find((row) => row.filter_config === wantedFilter);
    const fallback = metricRows.find((row) => row.filter_config === null);
    const selected = exact ?? fallback;

    const isIssues = metricKey === 'staleIssuesCount';
    const count = isIssues
      ? selected?.stale_issues_count ?? 0
      : selected?.stale_prs_count ?? 0;
    const kind = isIssues ? 'issue' : 'pr';

    const staleCutoff = new Date(
      new Date(latestSnapshot.snapshot_date + 'T00:00:00Z').getTime() -
        90 * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .slice(0, 10);

    const labelQualifiers = (parsedFilter?.labels ?? [])
      .map((label) => `label:"${label}"`)
      .join('+');
    const searchQuery = `is:${kind}+is:open+-updated:>=${staleCutoff}${
      labelQualifiers ? `+${labelQualifiers}` : ''
    }`;
    const searchUrl = `https://github.com/${repo.owner}/${
      repo.name
    }/issues?q=${encodeURIComponent(searchQuery)}`;

    return {
      metricKey,
      snapshotDate: latestSnapshot.snapshot_date,
      repo: { owner: repo.owner, name: repo.name },
      summary: {
        count,
        staleCutoffDate: staleCutoff,
        description: `Open ${
          isIssues ? 'issues' : 'pull requests'
        } not updated since ${staleCutoff}.`,
        searchUrl,
      },
      entries: [],
    };
  }

  if (
    metricKey === 'openIssuesCount' ||
    metricKey === 'openPullRequestsCount' ||
    metricKey === 'starsCount'
  ) {
    const wantedFilter = canonicalizeFilterConfig(repo.filterConfig);
    const metricRows = await db
      .selectFrom('github_health_metrics')
      .select([
        'filter_config',
        'open_issues_count',
        'open_pull_requests_count',
        'stars_count',
      ])
      .where('snapshot_id', '=', latestSnapshot.id)
      .where('repo_id', '=', repo.id)
      .execute();

    const exact = metricRows.find((row) => row.filter_config === wantedFilter);
    const fallback = metricRows.find((row) => row.filter_config === null);
    const selected = exact ?? fallback;

    const repoUrl = `https://github.com/${repo.owner}/${repo.name}`;
    let count = 0;
    let description = '';
    let externalUrl = repoUrl;

    if (metricKey === 'openIssuesCount') {
      count = selected?.open_issues_count ?? 0;
      description = 'Total open issues on the repository.';
      externalUrl = `${repoUrl}/issues?q=${encodeURIComponent('is:issue is:open')}`;
    } else if (metricKey === 'openPullRequestsCount') {
      count = selected?.open_pull_requests_count ?? 0;
      description = 'Total open pull requests on the repository.';
      externalUrl = `${repoUrl}/pulls?q=${encodeURIComponent('is:pr is:open')}`;
    } else {
      count = selected?.stars_count ?? 0;
      description = 'Total stargazers on the repository.';
      externalUrl = `${repoUrl}/stargazers`;
    }

    return {
      metricKey,
      snapshotDate: latestSnapshot.snapshot_date,
      repo: { owner: repo.owner, name: repo.name },
      summary: {
        count,
        description,
        externalUrl,
      },
      entries: [],
    };
  }

  const rawData = (await decompressJson<RawGitHubHealthData>(
    latestSnapshot.raw_data
  ))!;

  return buildMetricSourceData(
    metricKey,
    latestSnapshot.snapshot_date,
    { owner: repo.owner, name: repo.name },
    rawData,
    repo.filterConfig
  );
}

export function getFixturePackageHealthData(
  packageName: string
): PackageHealthData {
  return {
    packageName,
    installationConfigured: true,
    repo: getFixtureHealthRepo(packageName),
    filterConfig: null,
    snapshots: getFixtureHealthMetrics(packageName),
  };
}

export function getFixtureMetricSource(
  packageName: string,
  metricKey: HealthMetricKey
): MetricSourceData | null {
  const repo = getFixtureHealthRepo(packageName);
  const snapshots = getFixtureHealthMetrics(packageName);
  const latest = snapshots[snapshots.length - 1];

  if (!repo || !latest) return null;

  const syntheticEntries = Array.from({ length: 3 }).map((_, index) => ({
    id: `${metricKey}-${index + 1}`,
    number: index + 1,
    title: `Synthetic fixture item ${index + 1} for ${metricKey}`,
    url:
      metricKey.includes('pr') ||
      metricKey === 'prsMerged30d' ||
      metricKey === 'prsOpened30d' ||
      metricKey === 'stalePrsCount'
        ? `https://github.com/${repo.owner}/${repo.name}/pull/${index + 1}`
        : `https://github.com/${repo.owner}/${repo.name}/issues/${index + 1}`,
    createdAt: `${latest.snapshotDate}T0${index + 1}:00:00.000Z`,
    closedAt:
      metricKey === 'issuesClosed30d' || metricKey === 'openCloseRatio'
        ? `${latest.snapshotDate}T1${index + 1}:00:00.000Z`
        : null,
    mergedAt:
      metricKey === 'prsMerged30d' || metricKey === 'medianPrMergeHours'
        ? `${latest.snapshotDate}T1${index + 1}:30:00.000Z`
        : null,
    updatedAt: `${latest.snapshotDate}T1${index + 1}:45:00.000Z`,
    labels: ['fixture', metricKey],
    comments: [],
    reviews: [],
    author: null,
  }));

  return {
    metricKey,
    snapshotDate: latest.snapshotDate,
    repo,
    summary: {
      fixture: true,
      note: 'Fixture source data is synthetic and mirrors the raw GitHub objects shape used in production.',
    },
    entries: syntheticEntries,
  };
}
