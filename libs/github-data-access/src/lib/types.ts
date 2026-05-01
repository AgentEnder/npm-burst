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
  reviews: PullRequestReview[];
  comments: IssueInteraction[];
  author: GitHubActor | null;
}

export interface RawGitHubHealthData {
  repository: {
    owner: string;
    name: string;
    issues: RawIssueNode[];
    pullRequests: RawPullRequestNode[];
    staleIssues?: RawIssueNode[];
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
}

export interface HealthMetricSeriesPoint extends ComputedHealthMetrics {
  snapshotDate: string;
}
