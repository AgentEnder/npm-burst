import { isBotActor } from './bots';
import { hoursBetween, summarizeDurations } from './stats';
import type {
  BotPattern,
  ComputedHealthMetrics,
  FilterConfig,
  GitHubActor,
  IssueInteraction,
  RawGitHubHealthData,
  RawOpenItemCollection,
} from './types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function matchesLabelFilter(
  labels: string[],
  filterConfig: FilterConfig | null
): boolean {
  const wanted = filterConfig?.labels;
  if (!wanted || wanted.length === 0) return true;
  return wanted.every((label) => labels.includes(label));
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

function isSamePerson(
  a: GitHubActor | null | undefined,
  b: GitHubActor | null | undefined
): boolean {
  return !!a?.login && !!b?.login && a.login === b.login;
}

/**
 * The first interaction by a human who is not the item's author, or null if
 * nobody has responded yet. Bots and the author's own follow-ups don't count.
 */
export function findFirstHumanResponse(
  item: { author: GitHubActor | null },
  interactions: IssueInteraction[],
  patterns: BotPattern[]
): IssueInteraction | null {
  const sorted = [...interactions].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  return (
    sorted.find(
      (interaction) =>
        !isBotActor(interaction.author, patterns) &&
        !isSamePerson(interaction.author, item.author)
    ) ?? null
  );
}

export interface OpenItemAgeStats {
  avgHours: number | null;
  p95Hours: number | null;
}

/**
 * Backlog age over a collection fetched oldest-first. When the fetch was
 * truncated the average is unknowable; the unfiltered P95 is still exact as
 * long as its rank from the oldest end falls inside what was fetched.
 */
export function computeOpenItemAges(
  collection: RawOpenItemCollection | undefined,
  filterConfig: FilterConfig | null,
  now: Date
): OpenItemAgeStats {
  if (!collection) return { avgHours: null, p95Hours: null };

  const nowIso = now.toISOString();
  const ages = collection.items
    .filter((item) => matchesLabelFilter(item.labels, filterConfig))
    .map((item) => hoursBetween(item.createdAt, nowIso));

  if (!collection.truncated) {
    const stats = summarizeDurations(ages);
    return { avgHours: stats.avgHours, p95Hours: stats.p95Hours };
  }

  const filtered = filterConfig?.labels && filterConfig.labels.length > 0;
  if (filtered) return { avgHours: null, p95Hours: null };

  // `items` are the oldest `k` of `totalCount`, sorted ascending by createdAt,
  // i.e. descending by age. In an ascending-age sort of all N items the P95
  // sits at 1-based rank ceil(0.95·N); counting from the oldest end that is
  // 0-based index N − ceil(0.95·N).
  const total = collection.totalCount;
  const indexFromOldest = total - Math.ceil(0.95 * total);
  const p95 =
    indexFromOldest >= 0 && indexFromOldest < ages.length
      ? Math.round(ages[indexFromOldest] * 100) / 100
      : null;
  return { avgHours: null, p95Hours: p95 };
}

export function computeHealthMetrics(
  rawData: RawGitHubHealthData,
  filterConfig: FilterConfig | null,
  patterns: BotPattern[],
  now = new Date()
): ComputedHealthMetrics {
  const sinceMs = now.getTime() - 30 * DAY_IN_MS;
  const staleCutoff = now.getTime() - 90 * DAY_IN_MS;
  const inWindow = (iso: string | null): iso is string =>
    iso !== null && new Date(iso).getTime() >= sinceMs;

  const issues = rawData.repository.issues.filter((issue) =>
    matchesLabelFilter(issue.labels, filterConfig)
  );
  const prs = rawData.repository.pullRequests.filter((pr) =>
    matchesLabelFilter(pr.labels, filterConfig)
  );

  const issuesOpened = issues.filter((issue) => inWindow(issue.createdAt));
  const issuesClosed = issues.filter((issue) => inWindow(issue.closedAt));
  const prsOpened = prs.filter((pr) => inWindow(pr.createdAt));
  const prsMerged = prs.filter((pr) => inWindow(pr.mergedAt));
  const prsClosedUnmerged = prs.filter(
    (pr) => !pr.mergedAt && inWindow(pr.closedAt)
  );

  const staleIssuesCount = issues.filter(
    (issue) =>
      !issue.closedAt && new Date(issue.updatedAt).getTime() < staleCutoff
  ).length;
  const stalePrsCount = prs.filter(
    (pr) =>
      !pr.closedAt &&
      !pr.mergedAt &&
      new Date(pr.updatedAt).getTime() < staleCutoff
  ).length;

  const issueClose = summarizeDurations(
    issuesClosed.map((issue) =>
      hoursBetween(issue.createdAt, issue.closedAt as string)
    )
  );
  const prMerge = summarizeDurations(
    prsMerged.map((pr) => hoursBetween(pr.createdAt, pr.mergedAt as string))
  );

  const issueFirstResponseHours = issuesOpened.flatMap((issue) => {
    const response = findFirstHumanResponse(issue, issue.comments, patterns);
    return response ? [hoursBetween(issue.createdAt, response.createdAt)] : [];
  });
  const prFirstReviewHours = prsOpened.flatMap((pr) => {
    const review = findFirstHumanResponse(pr, pr.reviews, patterns);
    return review ? [hoursBetween(pr.createdAt, review.createdAt)] : [];
  });

  const contributors = new Set(
    prsMerged
      .filter((pr) => !isBotActor(pr.author, patterns))
      .map((pr) => pr.author?.login as string)
  );

  const issueAge = computeOpenItemAges(
    rawData.repository.openIssues,
    filterConfig,
    now
  );
  const prAge = computeOpenItemAges(
    rawData.repository.openPullRequests,
    filterConfig,
    now
  );

  return {
    issuesOpened30d: issuesOpened.length,
    issuesClosed30d: issuesClosed.length,
    prsOpened30d: prsOpened.length,
    prsMerged30d: prsMerged.length,
    prsClosedUnmerged30d: prsClosedUnmerged.length,
    medianIssueFirstResponseHours: summarizeDurations(issueFirstResponseHours)
      .medianHours,
    medianIssueCloseHours: issueClose.medianHours,
    medianPrFirstReviewHours:
      summarizeDurations(prFirstReviewHours).medianHours,
    medianPrMergeHours: prMerge.medianHours,
    activeContributors30d: contributors.size,
    staleIssuesCount,
    stalePrsCount,
    openIssuesCount: 0,
    openPullRequestsCount: 0,
    starsCount: 0,
    avgIssueCloseHours: issueClose.avgHours,
    p95IssueCloseHours: issueClose.p95Hours,
    avgPrMergeHours: prMerge.avgHours,
    p95PrMergeHours: prMerge.p95Hours,
    avgIssueAgeHours: issueAge.avgHours,
    p95IssueAgeHours: issueAge.p95Hours,
    avgPrAgeHours: prAge.avgHours,
    p95PrAgeHours: prAge.p95Hours,
  };
}
