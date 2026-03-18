import type { RawGitHubHealthData, RawIssueNode, RawPullRequestNode } from './types';

interface GitHubGraphqlPageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
}

interface GitHubIssueConnection {
  pageInfo: GitHubGraphqlPageInfo;
  nodes: Array<{
    id: string;
    number: number;
    title: string;
    createdAt: string;
    closedAt: string | null;
    updatedAt: string;
    labels: { nodes: Array<{ name: string }> };
  }>;
}

interface GitHubPullRequestConnection {
  pageInfo: GitHubGraphqlPageInfo;
  nodes: Array<{
    id: string;
    number: number;
    title: string;
    createdAt: string;
    closedAt: string | null;
    mergedAt: string | null;
    updatedAt: string;
    labels: { nodes: Array<{ name: string }> };
  }>;
}

interface GitHubRecentIssuesResponse {
  data?: {
    repository: {
      updatedIssues: GitHubIssueConnection;
      createdIssues: GitHubIssueConnection;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

interface GitHubRecentPullRequestsResponse {
  data?: {
    repository: {
      updatedPullRequests: GitHubPullRequestConnection;
      createdPullRequests: GitHubPullRequestConnection;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

interface GitHubIssueCountResponse {
  data?: {
    repository: {
      totalOpenIssues: {
        totalCount: number;
      };
      updatedOpenIssues: {
        totalCount: number;
      };
    } | null;
  };
  errors?: Array<{ message: string }>;
}

type GraphqlIssueNode = GitHubIssueConnection['nodes'][number];
type GraphqlPullRequestNode = GitHubPullRequestConnection['nodes'][number];

const RECENT_ISSUES_QUERY = `
  query RecentIssues(
    $owner: String!
    $name: String!
    $since: DateTime!
    $updatedCursor: String
    $createdCursor: String
  ) {
    repository(owner: $owner, name: $name) {
      updatedIssues: issues(
        first: 100
        after: $updatedCursor
        states: [OPEN, CLOSED]
        orderBy: { field: UPDATED_AT, direction: DESC }
        filterBy: { since: $since }
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          number
          title
          createdAt
          closedAt
          updatedAt
          labels(first: 20) { nodes { name } }
        }
      }
      createdIssues: issues(
        first: 100
        after: $createdCursor
        states: [OPEN, CLOSED]
        orderBy: { field: CREATED_AT, direction: DESC }
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          number
          title
          createdAt
          closedAt
          updatedAt
          labels(first: 20) { nodes { name } }
        }
      }
    }
  }
`;

const RECENT_PULL_REQUESTS_QUERY = `
  query RecentPullRequests(
    $owner: String!
    $name: String!
    $updatedCursor: String
    $createdCursor: String
  ) {
    repository(owner: $owner, name: $name) {
      updatedPullRequests: pullRequests(
        first: 100
        after: $updatedCursor
        states: [OPEN, MERGED, CLOSED]
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          number
          title
          createdAt
          closedAt
          mergedAt
          updatedAt
          labels(first: 20) { nodes { name } }
        }
      }
      createdPullRequests: pullRequests(
        first: 100
        after: $createdCursor
        states: [OPEN, MERGED, CLOSED]
        orderBy: { field: CREATED_AT, direction: DESC }
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          number
          title
          createdAt
          closedAt
          mergedAt
          updatedAt
          labels(first: 20) { nodes { name } }
        }
      }
    }
  }
`;

const STALE_ISSUE_COUNT_QUERY = `
  query StaleIssueCount(
    $owner: String!
    $name: String!
    $since: DateTime!
    $labels: [String!]
  ) {
    repository(owner: $owner, name: $name) {
      totalOpenIssues: issues(states: [OPEN], labels: $labels) { totalCount }
      updatedOpenIssues: issues(
        states: [OPEN]
        labels: $labels
        filterBy: { since: $since }
      ) { totalCount }
    }
  }
`;

export const FULL_FETCH_WINDOW_MS = 91 * 24 * 60 * 60 * 1000;

export interface GitHubFetchStats {
  requestCount: number;
  lastRateLimitLimit: number | null;
  lastRateLimitRemaining: number | null;
  lastRateLimitUsed: number | null;
  lastRateLimitResetAt: string | null;
}

export interface FetchRepoHealthOptions {
  since: string;
}

export interface GitHubHealthFetchResult {
  rawData: RawGitHubHealthData;
  staleIssuesCount: number;
  stalePrsCount: number;
  stats: GitHubFetchStats;
}

function createGitHubFetchStats(): GitHubFetchStats {
  return {
    requestCount: 0,
    lastRateLimitLimit: null,
    lastRateLimitRemaining: null,
    lastRateLimitUsed: null,
    lastRateLimitResetAt: null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubGraphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  userAgent: string,
  stats?: GitHubFetchStats
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (stats) {
      stats.requestCount += 1;
      stats.lastRateLimitLimit = Number.parseInt(
        response.headers.get('x-ratelimit-limit') ?? '',
        10
      ) || null;
      stats.lastRateLimitRemaining = Number.parseInt(
        response.headers.get('x-ratelimit-remaining') ?? '',
        10
      ) || null;
      stats.lastRateLimitUsed = Number.parseInt(
        response.headers.get('x-ratelimit-used') ?? '',
        10
      ) || null;

      const resetEpochSeconds = Number.parseInt(
        response.headers.get('x-ratelimit-reset') ?? '',
        10
      );
      stats.lastRateLimitResetAt = Number.isFinite(resetEpochSeconds)
        ? new Date(resetEpochSeconds * 1000).toISOString()
        : null;
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    const body = await response.text();
    const isSecondaryRateLimit =
      response.status === 403 && body.toLowerCase().includes('secondary rate limit');

    if (isSecondaryRateLimit && attempt < 2) {
      const retryAfterMs =
        Number.parseInt(response.headers.get('retry-after') ?? '', 10) * 1000 || 5000;
      console.warn(
        `GitHub GraphQL secondary rate limit hit; retrying in ${retryAfterMs}ms`,
        { variables }
      );
      await sleep(retryAfterMs);
      continue;
    }

    const tokenPrefix = token.slice(0, 8);
    console.error(
      `GitHub GraphQL ${response.status}: token=${tokenPrefix}… vars=${JSON.stringify(variables)} body=${body}`
    );
    throw new Error(`GitHub GraphQL request failed (${response.status}): ${body}`);
  }

  throw new Error('GitHub GraphQL request failed after retries');
}

function toRawIssueNode(issue: GraphqlIssueNode): RawIssueNode {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    createdAt: issue.createdAt,
    closedAt: issue.closedAt,
    updatedAt: issue.updatedAt,
    labels: issue.labels.nodes.map((label) => label.name),
    comments: [],
  };
}

function toRawPullRequestNode(pr: GraphqlPullRequestNode): RawPullRequestNode {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    createdAt: pr.createdAt,
    closedAt: pr.closedAt,
    mergedAt: pr.mergedAt,
    updatedAt: pr.updatedAt,
    labels: pr.labels.nodes.map((label) => label.name),
    comments: [],
    reviews: [],
    author: null,
  };
}

async function fetchRecentIssues(
  token: string,
  owner: string,
  name: string,
  since: string,
  userAgent: string,
  stats?: GitHubFetchStats
): Promise<RawIssueNode[]> {
  const sinceMs = new Date(since).getTime();
  let updatedCursor: string | null = null;
  let createdCursor: string | null = null;
  let updatedHasNextPage = true;
  let createdHasNextPage = true;
  const issues: RawIssueNode[] = [];

  while (updatedHasNextPage || createdHasNextPage) {
    const response: GitHubRecentIssuesResponse = await githubGraphql<GitHubRecentIssuesResponse>(
      token,
      RECENT_ISSUES_QUERY,
      {
        owner,
        name,
        since,
        updatedCursor: updatedHasNextPage ? updatedCursor : null,
        createdCursor: createdHasNextPage ? createdCursor : null,
      },
      userAgent,
      stats
    );

    if (response.errors?.length) {
      const message = response.errors.map((error: { message: string }) => error.message).join('; ');
      console.error(`GitHub recent-issues query errors for ${owner}/${name}: ${message}`);
      throw new Error(message);
    }

    const repository: NonNullable<GitHubRecentIssuesResponse['data']>['repository'] =
      response.data?.repository ?? null;
    if (!repository) {
      return issues;
    }

    if (updatedHasNextPage) {
      issues.push(...repository.updatedIssues.nodes.map(toRawIssueNode));
      updatedHasNextPage = repository.updatedIssues.pageInfo.hasNextPage;
      updatedCursor = repository.updatedIssues.pageInfo.endCursor;
    }

    if (createdHasNextPage) {
      for (const issue of repository.createdIssues.nodes) {
        if (new Date(issue.createdAt).getTime() < sinceMs) {
          createdHasNextPage = false;
          break;
        }
        issues.push(toRawIssueNode(issue));
      }

      if (createdHasNextPage) {
        createdHasNextPage = repository.createdIssues.pageInfo.hasNextPage;
        createdCursor = repository.createdIssues.pageInfo.endCursor;
      }
    }
  }

  return Array.from(new Map(issues.map((issue) => [issue.id, issue])).values());
}

async function fetchRecentPullRequests(
  token: string,
  owner: string,
  name: string,
  since: string,
  userAgent: string,
  stats?: GitHubFetchStats
): Promise<RawPullRequestNode[]> {
  const sinceMs = new Date(since).getTime();
  let updatedCursor: string | null = null;
  let createdCursor: string | null = null;
  let updatedHasNextPage = true;
  let createdHasNextPage = true;
  const pullRequests: RawPullRequestNode[] = [];

  while (updatedHasNextPage || createdHasNextPage) {
    const response: GitHubRecentPullRequestsResponse = await githubGraphql<GitHubRecentPullRequestsResponse>(
      token,
      RECENT_PULL_REQUESTS_QUERY,
      {
        owner,
        name,
        updatedCursor: updatedHasNextPage ? updatedCursor : null,
        createdCursor: createdHasNextPage ? createdCursor : null,
      },
      userAgent,
      stats
    );

    if (response.errors?.length) {
      const message = response.errors.map((error: { message: string }) => error.message).join('; ');
      console.error(`GitHub recent-PR query errors for ${owner}/${name}: ${message}`);
      throw new Error(message);
    }

    const repository: NonNullable<GitHubRecentPullRequestsResponse['data']>['repository'] =
      response.data?.repository ?? null;
    if (!repository) {
      return pullRequests;
    }

    if (updatedHasNextPage) {
      for (const pr of repository.updatedPullRequests.nodes) {
        if (new Date(pr.updatedAt).getTime() < sinceMs) {
          updatedHasNextPage = false;
          break;
        }
        pullRequests.push(toRawPullRequestNode(pr));
      }

      if (updatedHasNextPage) {
        updatedHasNextPage = repository.updatedPullRequests.pageInfo.hasNextPage;
        updatedCursor = repository.updatedPullRequests.pageInfo.endCursor;
      }
    }

    if (createdHasNextPage) {
      for (const pr of repository.createdPullRequests.nodes) {
        if (new Date(pr.createdAt).getTime() < sinceMs) {
          createdHasNextPage = false;
          break;
        }
        pullRequests.push(toRawPullRequestNode(pr));
      }

      if (createdHasNextPage) {
        createdHasNextPage = repository.createdPullRequests.pageInfo.hasNextPage;
        createdCursor = repository.createdPullRequests.pageInfo.endCursor;
      }
    }
  }

  return Array.from(new Map(pullRequests.map((pr) => [pr.id, pr])).values());
}

export async function fetchGitHubStaleIssueCount(
  token: string,
  owner: string,
  name: string,
  staleCutoffIso: string,
  labels: string[],
  options?: {
    userAgent?: string;
    stats?: GitHubFetchStats;
  }
): Promise<number> {
  const response = await githubGraphql<GitHubIssueCountResponse>(
    token,
    STALE_ISSUE_COUNT_QUERY,
    {
      owner,
      name,
      since: staleCutoffIso,
      labels: labels.length > 0 ? labels : null,
    },
    options?.userAgent ?? 'npm-burst',
    options?.stats
  );

  if (response.errors?.length) {
    const message = response.errors.map((error) => error.message).join('; ');
    console.error(`GitHub stale-count query errors for ${owner}/${name}: ${message}`);
    throw new Error(message);
  }

  const repository = response.data?.repository;
  if (!repository) {
    return 0;
  }

  return Math.max(
    0,
    repository.totalOpenIssues.totalCount - repository.updatedOpenIssues.totalCount
  );
}

export async function fetchGitHubStalePullRequestCount(
  token: string,
  owner: string,
  name: string,
  staleCutoffIso: string,
  labels: string[],
  options?: {
    userAgent?: string;
    stats?: GitHubFetchStats;
  }
): Promise<number> {
  const labelQualifier =
    labels.length > 0 ? ` ${labels.map((label) => `label:\"${label}\"`).join(' ')}` : '';
  const totalQuery = `repo:${owner}/${name} is:pr is:open${labelQualifier}`;
  const updatedQuery = `repo:${owner}/${name} is:pr is:open updated:>=${staleCutoffIso.replace(/\.\d{3}Z$/, 'Z')}${labelQualifier}`;
  const response = await githubGraphql<{
    data?: {
      totalOpenPullRequests: { issueCount: number };
      updatedOpenPullRequests: { issueCount: number };
    };
    errors?: Array<{ message: string }>;
  }>(
    token,
    STALE_PULL_REQUEST_COUNT_QUERY,
    { totalQuery, updatedQuery },
    options?.userAgent ?? 'npm-burst',
    options?.stats
  );

  if (response.errors?.length) {
    const message = response.errors.map((error: { message: string }) => error.message).join('; ');
    console.error(`GitHub stale-PR-count query errors for ${owner}/${name}: ${message}`);
    throw new Error(message);
  }

  return Math.max(
    0,
    (response.data?.totalOpenPullRequests.issueCount ?? 0) -
      (response.data?.updatedOpenPullRequests.issueCount ?? 0)
  );
}

export async function fetchGitHubHealthData(
  token: string,
  owner: string,
  name: string,
  options: FetchRepoHealthOptions,
  fetchOptions?: {
    userAgent?: string;
    stats?: GitHubFetchStats;
  }
): Promise<RawGitHubHealthData | null> {
  const { since } = options;
  const startedAt = Date.now();
  const userAgent = fetchOptions?.userAgent ?? 'npm-burst';

  const [issues, pullRequests] = await Promise.all([
    fetchRecentIssues(token, owner, name, since, userAgent, fetchOptions?.stats),
    fetchRecentPullRequests(token, owner, name, since, userAgent, fetchOptions?.stats),
  ]);

  console.info(`Fetched GitHub health data for ${owner}/${name}`, {
    since,
    recentIssueCount: issues.length,
    recentPullRequestCount: pullRequests.length,
    durationMs: Date.now() - startedAt,
  });

  return {
    repository: { owner, name, issues, pullRequests },
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchGitHubHealthDebugData(
  token: string,
  owner: string,
  name: string,
  options: FetchRepoHealthOptions,
  fetchOptions?: {
    userAgent?: string;
  }
): Promise<GitHubHealthFetchResult | null> {
  const stats = createGitHubFetchStats();
  const rawData = await fetchGitHubHealthData(token, owner, name, options, {
    userAgent: fetchOptions?.userAgent,
    stats,
  });
  if (!rawData) {
    return null;
  }

  const staleIssuesCount = await fetchGitHubStaleIssueCount(
    token,
    owner,
    name,
    new Date(Date.now() - FULL_FETCH_WINDOW_MS).toISOString(),
    [],
    {
      userAgent: fetchOptions?.userAgent,
      stats,
    }
  );
  const stalePrsCount = await fetchGitHubStalePullRequestCount(
    token,
    owner,
    name,
    new Date(Date.now() - FULL_FETCH_WINDOW_MS).toISOString(),
    [],
    {
      userAgent: fetchOptions?.userAgent,
      stats,
    }
  );

  return {
    rawData,
    staleIssuesCount,
    stalePrsCount,
    stats,
  };
}
const STALE_PULL_REQUEST_COUNT_QUERY = `
  query StalePullRequestCount($totalQuery: String!, $updatedQuery: String!) {
    totalOpenPullRequests: search(query: $totalQuery, type: ISSUE, first: 1) {
      issueCount
    }
    updatedOpenPullRequests: search(query: $updatedQuery, type: ISSUE, first: 1) {
      issueCount
    }
  }
`;
