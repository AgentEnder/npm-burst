export interface FilterConfig {
  labels?: string[];
  [key: string]: unknown;
}

export interface GitHubActor {
  login: string | null;
  __typename?: string | null;
  email?: string | null;
}

export interface IssueInteraction {
  createdAt: string;
  author: GitHubActor | null;
}

export interface PullRequestReview {
  createdAt: string;
  author: GitHubActor | null;
}

export interface RawIssueNode {
  id: string;
  number: number;
  title: string;
  createdAt: string;
  closedAt: string | null;
  updatedAt: string;
  labels: string[];
  author: GitHubActor | null;
  /** The first few comments in creation order — enough to find the first human response. */
  comments: IssueInteraction[];
}

export interface RawPullRequestNode {
  id: string;
  number: number;
  title: string;
  createdAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  updatedAt: string;
  labels: string[];
  author: GitHubActor | null;
  /** The first few reviews in creation order — enough to find the first human review. */
  reviews: PullRequestReview[];
}

/** One currently-open issue or pull request, as much as backlog age needs. */
export interface RawOpenItem {
  number: number;
  createdAt: string;
  labels: string[];
}

/**
 * Every open item of one kind, oldest first. `truncated` means the page cap
 * was hit and `items` holds only the oldest `items.length` of `totalCount`.
 */
export interface RawOpenItemCollection {
  items: RawOpenItem[];
  totalCount: number;
  truncated: boolean;
}

/**
 * Bumped when the shape of what a fetch collects changes in a way a delta
 * merge cannot repair. A stored snapshot with an older version is treated as
 * absent so the next run does a full fetch instead of a delta.
 */
export const RAW_HEALTH_DATA_VERSION = 2;

export interface RawGitHubHealthData {
  version?: number;
  repository: {
    owner: string;
    name: string;
    issues: RawIssueNode[];
    pullRequests: RawPullRequestNode[];
    staleIssues?: RawIssueNode[];
    openIssues?: RawOpenItemCollection;
    openPullRequests?: RawOpenItemCollection;
  };
  fetchedAt: string;
}

export interface BotPattern {
  pattern_type: 'username' | 'email' | 'username_suffix';
  pattern_value: string;
}

export interface ComputedHealthMetrics {
  issuesOpened30d: number;
  issuesClosed30d: number;
  prsOpened30d: number;
  prsMerged30d: number;
  prsClosedUnmerged30d: number;
  medianIssueFirstResponseHours: number | null;
  medianIssueCloseHours: number | null;
  medianPrFirstReviewHours: number | null;
  medianPrMergeHours: number | null;
  activeContributors30d: number;
  staleIssuesCount: number;
  stalePrsCount: number;
  openIssuesCount: number;
  openPullRequestsCount: number;
  starsCount: number;
  avgIssueCloseHours: number | null;
  p95IssueCloseHours: number | null;
  avgPrMergeHours: number | null;
  p95PrMergeHours: number | null;
  avgIssueAgeHours: number | null;
  p95IssueAgeHours: number | null;
  avgPrAgeHours: number | null;
  p95PrAgeHours: number | null;
}

export interface HealthMetricSeriesPoint extends ComputedHealthMetrics {
  snapshotDate: string;
}
