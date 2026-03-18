import {
  isBotActor,
  canonicalizeFilterConfig,
  parseFilterConfig,
  parseGitHubRepositoryUrl,
  type BotPattern,
  type FilterConfig,
  type HealthMetricSeriesPoint,
  type RawGitHubHealthData,
} from '@npm-burst/github-data-access';
import type { Kysely } from 'kysely';
import type { DB } from './db-schema';
import { getFixtureHealthMetrics, getFixtureHealthRepo } from './fixtures/packages';
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
  | 'staleIssuesCount';

export interface MetricSourceData {
  metricKey: HealthMetricKey;
  snapshotDate: string;
  repo: { owner: string; name: string };
  summary: Record<string, unknown>;
  entries: Record<string, unknown>[];
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function toMetricPoint(
  row: {
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
  }
): HealthMetricSeriesPoint {
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
  };
}

function matchesFilter(labels: string[], filterConfig: FilterConfig | null): boolean {
  const wantedLabels = filterConfig?.labels;
  if (!wantedLabels || wantedLabels.length === 0) return true;
  return wantedLabels.every((label) => labels.includes(label));
}

function getSourceNow(snapshotDate: string): Date {
  return new Date(`${snapshotDate}T23:59:59.000Z`);
}

function firstHumanIssueResponse(
  issue: RawGitHubHealthData['repository']['issues'][number],
  patterns: BotPattern[]
): string | null {
  return (
    issue.comments
      .filter((comment) => !isBotActor(comment.author, patterns))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.createdAt ??
    null
  );
}

function firstHumanPrReview(
  pr: RawGitHubHealthData['repository']['pullRequests'][number],
  patterns: BotPattern[]
): string | null {
  return (
    pr.reviews
      .filter((review) => !isBotActor(review.author, patterns))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.createdAt ??
    null
  );
}

function hoursBetween(start: string, end: string | null): number | null {
  if (!end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
  return Number(((endMs - startMs) / (60 * 60 * 1000)).toFixed(2));
}

async function loadBotPatterns(db: Kysely<DB>): Promise<BotPattern[]> {
  const rows = await db
    .selectFrom('github_bot_patterns')
    .select(['pattern_type', 'pattern_value'])
    .execute();

  return rows.map((row) => ({
    pattern_type: row.pattern_type as BotPattern['pattern_type'],
    pattern_value: row.pattern_value,
  }));
}

function buildMetricSourceData(
  metricKey: HealthMetricKey,
  snapshotDate: string,
  repo: { owner: string; name: string },
  rawData: RawGitHubHealthData,
  filterConfig: FilterConfig | null,
  botPatterns: BotPattern[]
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
          (issue) => issue.closedAt && new Date(issue.closedAt).getTime() >= sinceMs
        )
        .map((issue) => ({
          ...issue,
          url: `${repoUrl}/issues/${issue.number}`,
        }));
      return { metricKey, snapshotDate, repo, summary: { count: entries.length }, entries };
    }
    case 'openCloseRatio': {
      const opened = issues.filter(
        (issue) => new Date(issue.createdAt).getTime() >= sinceMs
      );
      const closed = issues.filter(
        (issue) => issue.closedAt && new Date(issue.closedAt).getTime() >= sinceMs
      );
      return {
        metricKey,
        snapshotDate,
        repo,
        summary: {
          issuesOpened30d: opened.length,
          issuesClosed30d: closed.length,
          ratio: opened.length > 0 ? Number((closed.length / opened.length).toFixed(2)) : null,
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
    case 'medianIssueFirstResponseHours': {
      const entries = issues
        .map((issue) => {
          const firstResponseAt = firstHumanIssueResponse(issue, botPatterns);
          const hours = hoursBetween(issue.createdAt, firstResponseAt);
          if (hours === null) return null;
          return {
            ...issue,
            firstResponseAt,
            hours,
            url: `${repoUrl}/issues/${issue.number}`,
          };
        })
        .filter((value): value is Record<string, unknown> => value !== null);
      return { metricKey, snapshotDate, repo, summary: { samples: entries.length }, entries };
    }
    case 'medianIssueCloseHours': {
      const entries = issues
        .map((issue) => {
          const hours = hoursBetween(issue.createdAt, issue.closedAt);
          if (hours === null) return null;
          return {
            ...issue,
            hours,
            url: `${repoUrl}/issues/${issue.number}`,
          };
        })
        .filter((value): value is Record<string, unknown> => value !== null);
      return { metricKey, snapshotDate, repo, summary: { samples: entries.length }, entries };
    }
    case 'prsOpened30d': {
      const entries = prs
        .filter((pr) => new Date(pr.createdAt).getTime() >= sinceMs)
        .map((pr) => ({
          ...pr,
          url: `${repoUrl}/pull/${pr.number}`,
        }));
      return { metricKey, snapshotDate, repo, summary: { count: entries.length }, entries };
    }
    case 'prsMerged30d': {
      const entries = prs
        .filter((pr) => pr.mergedAt && new Date(pr.mergedAt).getTime() >= sinceMs)
        .map((pr) => ({
          ...pr,
          url: `${repoUrl}/pull/${pr.number}`,
        }));
      return { metricKey, snapshotDate, repo, summary: { count: entries.length }, entries };
    }
    case 'prsClosedUnmerged30d': {
      const entries = prs
        .filter(
          (pr) =>
            pr.closedAt && !pr.mergedAt && new Date(pr.closedAt).getTime() >= sinceMs
        )
        .map((pr) => ({
          ...pr,
          url: `${repoUrl}/pull/${pr.number}`,
        }));
      return { metricKey, snapshotDate, repo, summary: { count: entries.length }, entries };
    }
    case 'medianPrFirstReviewHours': {
      const entries = prs
        .map((pr) => {
          const firstReviewAt = firstHumanPrReview(pr, botPatterns);
          const hours = hoursBetween(pr.createdAt, firstReviewAt);
          if (hours === null) return null;
          return {
            ...pr,
            firstReviewAt,
            hours,
            url: `${repoUrl}/pull/${pr.number}`,
          };
        })
        .filter((value): value is Record<string, unknown> => value !== null);
      return { metricKey, snapshotDate, repo, summary: { samples: entries.length }, entries };
    }
    case 'medianPrMergeHours': {
      const entries = prs
        .map((pr) => {
          const hours = hoursBetween(pr.createdAt, pr.mergedAt);
          if (hours === null) return null;
          return {
            ...pr,
            hours,
            url: `${repoUrl}/pull/${pr.number}`,
          };
        })
        .filter((value): value is Record<string, unknown> => value !== null);
      return { metricKey, snapshotDate, repo, summary: { samples: entries.length }, entries };
    }
    case 'activeContributors30d': {
      const contributorMap = new Map<string, { login: string; issueNumbers: number[]; prNumbers: number[] }>();
      for (const issue of issues) {
        for (const comment of issue.comments) {
          if (!isBotActor(comment.author, botPatterns) && comment.author?.login) {
            const existing = contributorMap.get(comment.author.login) ?? {
              login: comment.author.login,
              issueNumbers: [],
              prNumbers: [],
            };
            existing.issueNumbers.push(issue.number);
            contributorMap.set(comment.author.login, existing);
          }
        }
      }
      for (const pr of prs) {
        if (!isBotActor(pr.author, botPatterns) && pr.author?.login) {
          const existing = contributorMap.get(pr.author.login) ?? {
            login: pr.author.login,
            issueNumbers: [],
            prNumbers: [],
          };
          existing.prNumbers.push(pr.number);
          contributorMap.set(pr.author.login, existing);
        }
        for (const review of pr.reviews) {
          if (!isBotActor(review.author, botPatterns) && review.author?.login) {
            const existing = contributorMap.get(review.author.login) ?? {
              login: review.author.login,
              issueNumbers: [],
              prNumbers: [],
            };
            existing.prNumbers.push(pr.number);
            contributorMap.set(review.author.login, existing);
          }
        }
      }
      return {
        metricKey,
        snapshotDate,
        repo,
        summary: { count: contributorMap.size },
        entries: [...contributorMap.values()].sort((a, b) =>
          a.login.localeCompare(b.login)
        ),
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
      return { metricKey, snapshotDate, repo, summary: { count: entries.length }, entries };
    }
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

  const body = await cachedFetch(
    db,
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}`
  );

  let repository: unknown = null;
  try {
    repository = (JSON.parse(body) as { repository?: unknown }).repository;
  } catch {
    return null;
  }

  const parsed = parseGitHubRepositoryUrl(repository);
  if (!parsed) return null;

  const installation = await db
    .selectFrom('github_installations')
    .select('id')
    .where('owner', '=', parsed.owner)
    .$narrowType<{ id: number }>()
    .executeTakeFirst();

  await db
    .insertInto('github_repos')
    .values({
      installation_id: installation?.id ?? null,
      owner: parsed.owner,
      name: parsed.name,
    })
    .onConflict((oc) => oc.columns(['owner', 'name']).doNothing())
    .execute();

  const repo = await db
    .selectFrom('github_repos')
    .select(['id', 'owner', 'name'])
    .where('owner', '=', parsed.owner)
    .where('name', '=', parsed.name)
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
    .select(['snapshot_date', 'raw_data'])
    .where('repo_id', '=', repo.id)
    .orderBy('snapshot_date', 'desc')
    .executeTakeFirst();

  if (!latestSnapshot) return null;

  const rawData = JSON.parse(latestSnapshot.raw_data) as RawGitHubHealthData;
  const botPatterns = await loadBotPatterns(db);

  return buildMetricSourceData(
    metricKey,
    latestSnapshot.snapshot_date,
    { owner: repo.owner, name: repo.name },
    rawData,
    repo.filterConfig,
    botPatterns
  );
}

export function getFixturePackageHealthData(packageName: string): PackageHealthData {
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
      metricKey.includes('pr') || metricKey === 'prsMerged30d' || metricKey === 'prsOpened30d'
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
    comments: [
      {
        createdAt: `${latest.snapshotDate}T0${index + 2}:00:00.000Z`,
        author: { login: 'fixture-maintainer', __typename: 'User' },
      },
    ],
    reviews: [
      {
        createdAt: `${latest.snapshotDate}T0${index + 3}:00:00.000Z`,
        author: { login: 'fixture-reviewer', __typename: 'User' },
      },
    ],
    author: { login: 'fixture-contributor', __typename: 'User' },
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
