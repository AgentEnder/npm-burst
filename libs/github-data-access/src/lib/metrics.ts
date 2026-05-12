import type {
  BotPattern,
  ComputedHealthMetrics,
  FilterConfig,
  RawGitHubHealthData,
} from './types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function matchesFilter(
  item: { labels: string[] },
  filterConfig: FilterConfig | null
): boolean {
  const labels = filterConfig?.labels;
  if (!labels || labels.length === 0) return true;
  return labels.every((label) => item.labels.includes(label));
}

export function canonicalizeFilterConfig(
  filterConfig: FilterConfig | null | undefined
): string | null {
  if (!filterConfig) return null;
  const normalized: FilterConfig = {};

  for (const key of Object.keys(filterConfig).sort()) {
    const value = filterConfig[key];
    if (Array.isArray(value)) {
      normalized[key] = [...value].sort();
    } else if (value !== undefined) {
      normalized[key] = value;
    }
  }

  return JSON.stringify(normalized);
}

export function parseFilterConfig(
  raw: string | null | undefined
): FilterConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FilterConfig;
  } catch {
    return null;
  }
}

export function computeHealthMetrics(
  rawData: RawGitHubHealthData,
  filterConfig: FilterConfig | null,
  _patterns: BotPattern[],
  now = new Date()
): ComputedHealthMetrics {
  const sinceMs = now.getTime() - 30 * DAY_IN_MS;
  const staleCutoff = now.getTime() - 90 * DAY_IN_MS;

  const issues = rawData.repository.issues.filter((issue) =>
    matchesFilter(issue, filterConfig)
  );
  const prs = rawData.repository.pullRequests.filter((pr) =>
    matchesFilter(pr, filterConfig)
  );
  const issuesOpened30d = issues.filter(
    (issue) => new Date(issue.createdAt).getTime() >= sinceMs
  ).length;
  const issuesClosed30d = issues.filter(
    (issue) => issue.closedAt && new Date(issue.closedAt).getTime() >= sinceMs
  ).length;
  const prsOpened30d = prs.filter(
    (pr) => new Date(pr.createdAt).getTime() >= sinceMs
  ).length;
  const prsMerged30d = prs.filter(
    (pr) => pr.mergedAt && new Date(pr.mergedAt).getTime() >= sinceMs
  ).length;
  const prsClosedUnmerged30d = prs.filter(
    (pr) =>
      pr.closedAt && !pr.mergedAt && new Date(pr.closedAt).getTime() >= sinceMs
  ).length;

  const staleIssuesCount = issues.filter((issue) => {
    if (issue.closedAt) return false;
    return new Date(issue.updatedAt).getTime() < staleCutoff;
  }).length;
  const stalePrsCount = prs.filter((pr) => {
    if (pr.closedAt || pr.mergedAt) return false;
    return new Date(pr.updatedAt).getTime() < staleCutoff;
  }).length;

  return {
    issuesOpened30d,
    issuesClosed30d,
    prsOpened30d,
    prsMerged30d,
    prsClosedUnmerged30d,
    medianIssueFirstResponseHours: null,
    medianIssueCloseHours: null,
    medianPrFirstReviewHours: null,
    medianPrMergeHours: null,
    activeContributors30d: 0,
    staleIssuesCount,
    stalePrsCount,
    openIssuesCount: 0,
    openPullRequestsCount: 0,
    starsCount: 0,
  };
}
