import {
  RAW_HEALTH_DATA_VERSION,
  type GitHubActor,
  type RawGitHubHealthData,
  type RawIssueNode,
  type RawOpenItem,
  type RawOpenItemCollection,
  type RawPullRequestNode,
} from './types';

interface GitHubGraphqlPageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
}

interface GraphqlActor {
  login: string;
  __typename: string;
}

interface GraphqlInteraction {
  createdAt: string;
  author: GraphqlActor | null;
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
    author: GraphqlActor | null;
    comments: { nodes: GraphqlInteraction[] };
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
    author: GraphqlActor | null;
    reviews: { nodes: GraphqlInteraction[] };
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

/**
 * How many comments / reviews to pull per item. Only the first human,
 * non-author one matters, and it is almost always in the first handful.
 */
const INTERACTIONS_PER_ITEM = 10;

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
          author { login __typename }
          comments(first: ${INTERACTIONS_PER_ITEM}) {
            nodes { createdAt author { login __typename } }
          }
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
          author { login __typename }
          comments(first: ${INTERACTIONS_PER_ITEM}) {
            nodes { createdAt author { login __typename } }
          }
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
          author { login __typename }
          reviews(first: ${INTERACTIONS_PER_ITEM}) {
            nodes { createdAt author { login __typename } }
          }
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
          author { login __typename }
          reviews(first: ${INTERACTIONS_PER_ITEM}) {
            nodes { createdAt author { login __typename } }
          }
        }
      }
    }
  }
`;

const REPO_SNAPSHOT_COUNTS_QUERY = `
  query RepoSnapshotCounts($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      stargazerCount
      openIssues: issues(states: [OPEN]) { totalCount }
      openPullRequests: pullRequests(states: [OPEN]) { totalCount }
    }
  }
`;

interface GitHubRepoSnapshotCountsResponse {
  data?: {
    repository: {
      stargazerCount: number;
      openIssues: { totalCount: number };
      openPullRequests: { totalCount: number };
    } | null;
  };
  errors?: Array<{ message: string }>;
}

export interface GitHubRepoSnapshotCounts {
  starsCount: number;
  openIssuesCount: number;
  openPullRequestsCount: number;
}

export async function fetchGitHubRepoSnapshotCounts(
  token: string,
  owner: string,
  name: string,
  options?: {
    userAgent?: string;
    stats?: GitHubFetchStats;
  }
): Promise<GitHubRepoSnapshotCounts> {
  const response = await githubGraphql<GitHubRepoSnapshotCountsResponse>(
    token,
    REPO_SNAPSHOT_COUNTS_QUERY,
    { owner, name },
    options?.userAgent ?? 'npm-burst',
    options?.stats
  );

  if (response.errors?.length) {
    const message = response.errors.map((error) => error.message).join('; ');
    console.error(
      `GitHub repo-snapshot-counts query errors for ${owner}/${name}: ${message}`
    );
    throw new Error(message);
  }

  const repository = response.data?.repository;
  if (!repository) {
    return { starsCount: 0, openIssuesCount: 0, openPullRequestsCount: 0 };
  }

  return {
    starsCount: repository.stargazerCount,
    openIssuesCount: repository.openIssues.totalCount,
    openPullRequestsCount: repository.openPullRequests.totalCount,
  };
}

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
      stats.lastRateLimitLimit =
        Number.parseInt(response.headers.get('x-ratelimit-limit') ?? '', 10) ||
        null;
      stats.lastRateLimitRemaining =
        Number.parseInt(
          response.headers.get('x-ratelimit-remaining') ?? '',
          10
        ) || null;
      stats.lastRateLimitUsed =
        Number.parseInt(response.headers.get('x-ratelimit-used') ?? '', 10) ||
        null;

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
      response.status === 403 &&
      body.toLowerCase().includes('secondary rate limit');

    if (isSecondaryRateLimit && attempt < 2) {
      const retryAfterMs =
        Number.parseInt(response.headers.get('retry-after') ?? '', 10) * 1000 ||
        5000;
      console.warn(
        `GitHub GraphQL secondary rate limit hit; retrying in ${retryAfterMs}ms`,
        { variables }
      );
      await sleep(retryAfterMs);
      continue;
    }

    const tokenPrefix = token.slice(0, 8);
    console.error(
      `GitHub GraphQL ${
        response.status
      }: token=${tokenPrefix}… vars=${JSON.stringify(variables)} body=${body}`
    );
    throw new Error(
      `GitHub GraphQL request failed (${response.status}): ${body}`
    );
  }

  throw new Error('GitHub GraphQL request failed after retries');
}

function toActor(actor: GraphqlActor | null): GitHubActor | null {
  return actor ? { login: actor.login, __typename: actor.__typename } : null;
}

function toInteraction(interaction: GraphqlInteraction) {
  return {
    createdAt: interaction.createdAt,
    author: toActor(interaction.author),
  };
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
    author: toActor(issue.author),
    comments: issue.comments.nodes.map(toInteraction),
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
    author: toActor(pr.author),
    reviews: pr.reviews.nodes.map(toInteraction),
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
    const response: GitHubRecentIssuesResponse =
      await githubGraphql<GitHubRecentIssuesResponse>(
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
      const message = response.errors
        .map((error: { message: string }) => error.message)
        .join('; ');
      console.error(
        `GitHub recent-issues query errors for ${owner}/${name}: ${message}`
      );
      throw new Error(message);
    }

    const repository: NonNullable<
      GitHubRecentIssuesResponse['data']
    >['repository'] = response.data?.repository ?? null;
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
    const response: GitHubRecentPullRequestsResponse =
      await githubGraphql<GitHubRecentPullRequestsResponse>(
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
      const message = response.errors
        .map((error: { message: string }) => error.message)
        .join('; ');
      console.error(
        `GitHub recent-PR query errors for ${owner}/${name}: ${message}`
      );
      throw new Error(message);
    }

    const repository: NonNullable<
      GitHubRecentPullRequestsResponse['data']
    >['repository'] = response.data?.repository ?? null;
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
        updatedHasNextPage =
          repository.updatedPullRequests.pageInfo.hasNextPage;
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
        createdHasNextPage =
          repository.createdPullRequests.pageInfo.hasNextPage;
        createdCursor = repository.createdPullRequests.pageInfo.endCursor;
      }
    }
  }

  return Array.from(new Map(pullRequests.map((pr) => [pr.id, pr])).values());
}

/**
 * Pages of open items fetched per kind before giving up. The sort is
 * oldest-first, so a truncated fetch still holds the oldest items — see
 * `computeOpenItemAges` for what stays computable.
 */
export const OPEN_ITEMS_PAGE_CAP = 30;

const OPEN_ITEMS_QUERY = `
  query OpenItems(
    $owner: String!
    $name: String!
    $issueCursor: String
    $prCursor: String
    $fetchIssues: Boolean!
    $fetchPrs: Boolean!
  ) {
    repository(owner: $owner, name: $name) {
      openIssues: issues(
        first: 100
        after: $issueCursor
        states: [OPEN]
        orderBy: { field: CREATED_AT, direction: ASC }
      ) @include(if: $fetchIssues) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes { number createdAt labels(first: 20) { nodes { name } } }
      }
      openPullRequests: pullRequests(
        first: 100
        after: $prCursor
        states: [OPEN]
        orderBy: { field: CREATED_AT, direction: ASC }
      ) @include(if: $fetchPrs) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes { number createdAt labels(first: 20) { nodes { name } } }
      }
    }
  }
`;

interface GitHubOpenItemConnection {
  totalCount: number;
  pageInfo: GitHubGraphqlPageInfo;
  nodes: Array<{
    number: number;
    createdAt: string;
    labels: { nodes: Array<{ name: string }> };
  }>;
}

interface GitHubOpenItemsResponse {
  data?: {
    repository: {
      openIssues?: GitHubOpenItemConnection;
      openPullRequests?: GitHubOpenItemConnection;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

export interface GitHubOpenItems {
  openIssues: RawOpenItemCollection;
  openPullRequests: RawOpenItemCollection;
}

function emptyOpenItems(): RawOpenItemCollection {
  return { items: [], totalCount: 0, truncated: false };
}

/**
 * Every open issue and pull request, oldest first, with only what backlog
 * age needs. Both kinds page in lock-step through one query so a repo costs
 * max(issuePages, prPages) requests rather than the sum.
 */
export async function fetchGitHubOpenItems(
  token: string,
  owner: string,
  name: string,
  options?: {
    userAgent?: string;
    stats?: GitHubFetchStats;
  }
): Promise<GitHubOpenItems> {
  const result: GitHubOpenItems = {
    openIssues: emptyOpenItems(),
    openPullRequests: emptyOpenItems(),
  };
  let issueCursor: string | null = null;
  let prCursor: string | null = null;
  let fetchIssues = true;
  let fetchPrs = true;

  const collect = (
    target: RawOpenItemCollection,
    connection: GitHubOpenItemConnection
  ): { hasNextPage: boolean; endCursor: string | null } => {
    target.totalCount = connection.totalCount;
    target.items.push(
      ...connection.nodes.map(
        (node): RawOpenItem => ({
          number: node.number,
          createdAt: node.createdAt,
          labels: node.labels.nodes.map((label) => label.name),
        })
      )
    );
    return connection.pageInfo;
  };

  for (let page = 0; fetchIssues || fetchPrs; page += 1) {
    if (page >= OPEN_ITEMS_PAGE_CAP) {
      if (fetchIssues) result.openIssues.truncated = true;
      if (fetchPrs) result.openPullRequests.truncated = true;
      break;
    }

    const response: GitHubOpenItemsResponse =
      await githubGraphql<GitHubOpenItemsResponse>(
        token,
        OPEN_ITEMS_QUERY,
        { owner, name, issueCursor, prCursor, fetchIssues, fetchPrs },
        options?.userAgent ?? 'npm-burst',
        options?.stats
      );

    if (response.errors?.length) {
      const message = response.errors
        .map((error: { message: string }) => error.message)
        .join('; ');
      console.error(
        `GitHub open-items query errors for ${owner}/${name}: ${message}`
      );
      throw new Error(message);
    }

    const repository = response.data?.repository;
    if (!repository) {
      return result;
    }

    if (fetchIssues && repository.openIssues) {
      const pageInfo = collect(result.openIssues, repository.openIssues);
      fetchIssues = pageInfo.hasNextPage;
      issueCursor = pageInfo.endCursor;
    } else {
      fetchIssues = false;
    }

    if (fetchPrs && repository.openPullRequests) {
      const pageInfo = collect(
        result.openPullRequests,
        repository.openPullRequests
      );
      fetchPrs = pageInfo.hasNextPage;
      prCursor = pageInfo.endCursor;
    } else {
      fetchPrs = false;
    }
  }

  return result;
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
    console.error(
      `GitHub stale-count query errors for ${owner}/${name}: ${message}`
    );
    throw new Error(message);
  }

  const repository = response.data?.repository;
  if (!repository) {
    return 0;
  }

  return Math.max(
    0,
    repository.totalOpenIssues.totalCount -
      repository.updatedOpenIssues.totalCount
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
    labels.length > 0
      ? ` ${labels.map((label) => `label:\"${label}\"`).join(' ')}`
      : '';
  const totalQuery = `repo:${owner}/${name} is:pr is:open${labelQualifier}`;
  const updatedQuery = `repo:${owner}/${name} is:pr is:open updated:>=${staleCutoffIso.replace(
    /\.\d{3}Z$/,
    'Z'
  )}${labelQualifier}`;
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
    const message = response.errors
      .map((error: { message: string }) => error.message)
      .join('; ');
    console.error(
      `GitHub stale-PR-count query errors for ${owner}/${name}: ${message}`
    );
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

  const [issues, pullRequests, openItems] = await Promise.all([
    fetchRecentIssues(
      token,
      owner,
      name,
      since,
      userAgent,
      fetchOptions?.stats
    ),
    fetchRecentPullRequests(
      token,
      owner,
      name,
      since,
      userAgent,
      fetchOptions?.stats
    ),
    fetchGitHubOpenItems(token, owner, name, {
      userAgent,
      stats: fetchOptions?.stats,
    }),
  ]);

  console.info(`Fetched GitHub health data for ${owner}/${name}`, {
    since,
    recentIssueCount: issues.length,
    recentPullRequestCount: pullRequests.length,
    openIssueCount: openItems.openIssues.totalCount,
    openPullRequestCount: openItems.openPullRequests.totalCount,
    openItemsTruncated:
      openItems.openIssues.truncated || openItems.openPullRequests.truncated,
    durationMs: Date.now() - startedAt,
  });

  return {
    version: RAW_HEALTH_DATA_VERSION,
    repository: {
      owner,
      name,
      issues,
      pullRequests,
      openIssues: openItems.openIssues,
      openPullRequests: openItems.openPullRequests,
    },
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
