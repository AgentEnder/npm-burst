import { isBotActor } from './bots';
import type {
  BotPattern,
  ComputedHealthMetrics,
  FilterConfig,
  RawGitHubHealthData,
  RawIssueNode,
  RawPullRequestNode,
} from './types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function toMs(value: string | null): number | null {
  return value ? new Date(value).getTime() : null;
}

function hoursBetween(start: string, end: string | null): number | null {
  const startMs = toMs(start);
  const endMs = toMs(end);
  if (startMs === null || endMs === null || endMs < startMs) return null;
  return (endMs - startMs) / (60 * 60 * 1000);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function matchesFilter(
  item: { labels: string[] },
  filterConfig: FilterConfig | null
): boolean {
  const labels = filterConfig?.labels;
  if (!labels || labels.length === 0) return true;
  return labels.every((label) => item.labels.includes(label));
}

function firstHumanIssueResponse(
  issue: RawIssueNode,
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
  pr: RawPullRequestNode,
  patterns: BotPattern[]
): string | null {
  return (
    pr.reviews
      .filter((review) => !isBotActor(review.author, patterns))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.createdAt ??
    null
  );
}

function collectContributors(
  issues: RawIssueNode[],
  prs: RawPullRequestNode[],
  patterns: BotPattern[]
): number {
  const logins = new Set<string>();

  for (const issue of issues) {
    for (const comment of issue.comments) {
      if (!isBotActor(comment.author, patterns) && comment.author?.login) {
        logins.add(comment.author.login.toLowerCase());
      }
    }
  }

  for (const pr of prs) {
    if (!isBotActor(pr.author, patterns) && pr.author?.login) {
      logins.add(pr.author.login.toLowerCase());
    }
    for (const review of pr.reviews) {
      if (!isBotActor(review.author, patterns) && review.author?.login) {
        logins.add(review.author.login.toLowerCase());
      }
    }
  }

  return logins.size;
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
  patterns: BotPattern[],
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
      pr.closedAt &&
      !pr.mergedAt &&
      new Date(pr.closedAt).getTime() >= sinceMs
  ).length;

  const issueFirstResponseHours = issues
    .map((issue) => hoursBetween(issue.createdAt, firstHumanIssueResponse(issue, patterns)))
    .filter((value): value is number => value !== null);

  const issueCloseHours = issues
    .map((issue) => hoursBetween(issue.createdAt, issue.closedAt))
    .filter((value): value is number => value !== null);

  const prFirstReviewHours = prs
    .map((pr) => hoursBetween(pr.createdAt, firstHumanPrReview(pr, patterns)))
    .filter((value): value is number => value !== null);

  const prMergeHours = prs
    .map((pr) => hoursBetween(pr.createdAt, pr.mergedAt))
    .filter((value): value is number => value !== null);

  const staleIssuesCount = issues.filter((issue) => {
    if (issue.closedAt) return false;
    return new Date(issue.updatedAt).getTime() < staleCutoff;
  }).length;

  return {
    issuesOpened30d,
    issuesClosed30d,
    prsOpened30d,
    prsMerged30d,
    prsClosedUnmerged30d,
    medianIssueFirstResponseHours: median(issueFirstResponseHours),
    medianIssueCloseHours: median(issueCloseHours),
    medianPrFirstReviewHours: median(prFirstReviewHours),
    medianPrMergeHours: median(prMergeHours),
    activeContributors30d: collectContributors(issues, prs, patterns),
    staleIssuesCount,
  };
}
