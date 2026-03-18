import {
  canonicalizeFilterConfig,
  computeHealthMetrics,
  decryptToken,
  encryptToken,
  parseFilterConfig,
  type BotPattern,
  type RawGitHubHealthData,
} from '@npm-burst/github-data-access';
import type { Kysely } from 'kysely';
import type { DB } from './db-schema';
import type { Env } from './env';
import { ensureGitHubRepoForPackage } from './github-health';

interface GitHubGraphqlPageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
}

interface GitHubGraphqlResponse {
  data?: {
    repository: {
      issues: {
        pageInfo: GitHubGraphqlPageInfo;
        nodes: Array<{
          id: string;
          number: number;
          title: string;
          createdAt: string;
          closedAt: string | null;
          updatedAt: string;
          labels: { nodes: Array<{ name: string }> };
          comments: {
            nodes: Array<{
              createdAt: string;
              author: { login: string | null; __typename: string | null } | null;
            }>;
          };
        }>;
      };
      pullRequests: {
        pageInfo: GitHubGraphqlPageInfo;
        nodes: Array<{
          id: string;
          number: number;
          title: string;
          createdAt: string;
          closedAt: string | null;
          mergedAt: string | null;
          updatedAt: string;
          author: { login: string | null; __typename: string | null } | null;
          labels: { nodes: Array<{ name: string }> };
          comments: {
            nodes: Array<{
              createdAt: string;
              author: { login: string | null; __typename: string | null } | null;
            }>;
          };
          reviews: {
            nodes: Array<{
              createdAt: string;
              author: { login: string | null; __typename: string | null } | null;
            }>;
          };
        }>;
      };
    } | null;
  };
  errors?: Array<{ message: string }>;
}

type GitHubRepositoryResult = NonNullable<
  NonNullable<GitHubGraphqlResponse['data']>['repository']
>;
type GraphqlIssueNode = GitHubRepositoryResult['issues']['nodes'][number];
type GraphqlPullRequestNode =
  GitHubRepositoryResult['pullRequests']['nodes'][number];

const REPO_HEALTH_QUERY = `
  query RepoHealth(
    $owner: String!
    $name: String!
    $issuesCursor: String
    $prsCursor: String
  ) {
    repository(owner: $owner, name: $name) {
      issues(
        first: 100
        after: $issuesCursor
        states: [OPEN, CLOSED]
        orderBy: { field: UPDATED_AT, direction: DESC }
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
          comments(first: 20) {
            nodes {
              createdAt
              author { login __typename }
            }
          }
        }
      }
      pullRequests(
        first: 100
        after: $prsCursor
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
          author { login __typename }
          labels(first: 20) { nodes { name } }
          comments(first: 20) {
            nodes {
              createdAt
              author { login __typename }
            }
          }
          reviews(first: 20) {
            nodes {
              createdAt
              author { login __typename }
            }
          }
        }
      }
    }
  }
`;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function toBase64Url(input: string | Uint8Array): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createAppJwt(appId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iat: now - 60, exp: now + 9 * 60, iss: appId };
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  return `${encodedHeader}.${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

function normalizeBlob(value: Uint8Array | ArrayBuffer | null): Uint8Array | null {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
}

async function refreshInstallationToken(
  db: Kysely<DB>,
  installation: { id: number; installation_id: number },
  env: Env
): Promise<string | null> {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY || !env.ENCRYPTION_KEY) {
    return null;
  }

  const jwt = await createAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  const response = await fetch(
    `https://api.github.com/app/installations/${installation.installation_id}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${jwt}`,
        'User-Agent': 'npm-burst-app',
      },
    }
  );

  if (!response.ok) {
    console.error(
      `Failed to refresh GitHub installation token ${installation.installation_id}: ${response.status}`
    );
    return null;
  }

  const body = (await response.json()) as { token: string; expires_at: string };
  const encrypted = await encryptToken(body.token, env.ENCRYPTION_KEY);

  await db
    .updateTable('github_installations')
    .set({
      encrypted_access_token: encrypted,
      token_expires_at: body.expires_at,
      updated_at: new Date().toISOString(),
    })
    .where('id', '=', installation.id)
    .execute();

  return body.token;
}

async function getInstallationToken(
  db: Kysely<DB>,
  installationRowId: number | null,
  env: Env
): Promise<string | null> {
  if (!installationRowId) return null;

  const installation = await db
    .selectFrom('github_installations')
    .select([
      'id',
      'installation_id',
      'encrypted_access_token',
      'token_expires_at',
    ])
    .where('id', '=', installationRowId)
    .executeTakeFirst();

  if (!installation?.id) return null;

  const encrypted = normalizeBlob(installation.encrypted_access_token);
  const expiresAt = installation.token_expires_at
    ? new Date(installation.token_expires_at).getTime()
    : 0;
  const refreshNeeded = expiresAt <= Date.now() + 5 * 60 * 1000;

  if (!refreshNeeded && encrypted && env.ENCRYPTION_KEY) {
    return decryptToken(encrypted, env.ENCRYPTION_KEY);
  }

  return refreshInstallationToken(
    db,
    { id: installation.id, installation_id: installation.installation_id },
    env
  );
}

async function githubGraphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'npm-burst-app',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

async function fetchRawRepoHealth(
  token: string,
  owner: string,
  name: string
): Promise<RawGitHubHealthData | null> {
  let issuesCursor: string | null = null;
  let prsCursor: string | null = null;
  let hasNextIssues = true;
  let hasNextPrs = true;
  const issues: RawGitHubHealthData['repository']['issues'] = [];
  const pullRequests: RawGitHubHealthData['repository']['pullRequests'] = [];

  while (hasNextIssues || hasNextPrs) {
    const response = await githubGraphql<GitHubGraphqlResponse>(
      token,
      REPO_HEALTH_QUERY,
      { owner, name, issuesCursor, prsCursor }
    );

    if (response.errors?.length) {
      throw new Error(response.errors.map((error) => error.message).join('; '));
    }

    const repository = response.data?.repository as GitHubRepositoryResult | null | undefined;
    if (!repository) return null;

    issues.push(
      ...repository.issues.nodes.map((issue: GraphqlIssueNode) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        createdAt: issue.createdAt,
        closedAt: issue.closedAt,
        updatedAt: issue.updatedAt,
        labels: issue.labels.nodes.map((label) => label.name),
        comments: issue.comments.nodes.map((comment) => ({
          createdAt: comment.createdAt,
          author: comment.author,
        })),
      }))
    );

    pullRequests.push(
      ...repository.pullRequests.nodes.map((pr: GraphqlPullRequestNode) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        createdAt: pr.createdAt,
        closedAt: pr.closedAt,
        mergedAt: pr.mergedAt,
        updatedAt: pr.updatedAt,
        author: pr.author,
        labels: pr.labels.nodes.map((label) => label.name),
        comments: pr.comments.nodes.map((comment) => ({
          createdAt: comment.createdAt,
          author: comment.author,
        })),
        reviews: pr.reviews.nodes.map((review) => ({
          createdAt: review.createdAt,
          author: review.author,
        })),
      }))
    );

    hasNextIssues = repository.issues.pageInfo.hasNextPage;
    hasNextPrs = repository.pullRequests.pageInfo.hasNextPage;
    issuesCursor = repository.issues.pageInfo.endCursor;
    prsCursor = repository.pullRequests.pageInfo.endCursor;
  }

  return {
    repository: { owner, name, issues, pullRequests },
    fetchedAt: new Date().toISOString(),
  };
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

export async function snapshotGitHubHealthForOwner(
  db: Kysely<DB>,
  env: Env,
  owner: string
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const trackedPackages = await db
    .selectFrom('tracked_packages as tp')
    .innerJoin('user_tracked_packages as utp', 'utp.package_id', 'tp.id')
    .select('tp.package_name')
    .distinct()
    .execute();

  for (const row of trackedPackages) {
    const repo = await ensureGitHubRepoForPackage(db, row.package_name);
    if (repo?.owner !== owner) {
      continue;
    }
  }

  const repos = await db
    .selectFrom('github_repos as gr')
    .innerJoin('github_repo_packages as grp', 'grp.repo_id', 'gr.id')
    .innerJoin('tracked_packages as tp', 'tp.package_name', 'grp.package_name')
    .innerJoin('user_tracked_packages as utp', 'utp.package_id', 'tp.id')
    .select(['gr.id', 'gr.owner', 'gr.name', 'gr.installation_id'])
    .where('gr.owner', '=', owner)
    .$narrowType<{ id: number; owner: string; name: string; installation_id: number | null }>()
    .distinct()
    .execute();

  if (repos.length === 0) {
    return;
  }

  const botPatterns = await loadBotPatterns(db);

  for (const repo of repos) {
    const existing = await db
      .selectFrom('github_health_snapshots')
      .select('id')
      .where('repo_id', '=', repo.id)
      .where('snapshot_date', '=', today)
      .executeTakeFirst();

    if (existing) {
      continue;
    }

    try {
      const token = await getInstallationToken(db, repo.installation_id, env);
      if (!token) {
        continue;
      }

      const rawData = await fetchRawRepoHealth(token, repo.owner, repo.name);
      if (!rawData) {
        continue;
      }

      const snapshot = await db
        .insertInto('github_health_snapshots')
        .values({
          repo_id: repo.id,
          snapshot_date: today,
          raw_data: JSON.stringify(rawData),
        })
        .returning('id')
        .$narrowType<{ id: number }>()
        .executeTakeFirst();

      if (!snapshot?.id) {
        continue;
      }

      const filterRows = await db
        .selectFrom('github_repo_packages')
        .select('filter_config')
        .where('repo_id', '=', repo.id)
        .execute();

      const seen = new Set<string | null>([null]);
      const filterConfigs = [null as string | null];
      for (const row of filterRows) {
        const normalized = canonicalizeFilterConfig(parseFilterConfig(row.filter_config));
        if (!seen.has(normalized)) {
          seen.add(normalized);
          filterConfigs.push(normalized);
        }
      }

      for (const rawFilterConfig of filterConfigs) {
        const metrics = computeHealthMetrics(
          rawData,
          parseFilterConfig(rawFilterConfig),
          botPatterns
        );

        await db
          .insertInto('github_health_metrics')
          .values({
            snapshot_id: snapshot.id,
            repo_id: repo.id,
            filter_config: rawFilterConfig,
            issues_opened_30d: metrics.issuesOpened30d,
            issues_closed_30d: metrics.issuesClosed30d,
            prs_opened_30d: metrics.prsOpened30d,
            prs_merged_30d: metrics.prsMerged30d,
            prs_closed_unmerged_30d: metrics.prsClosedUnmerged30d,
            median_issue_first_response_hours:
              metrics.medianIssueFirstResponseHours,
            median_issue_close_hours: metrics.medianIssueCloseHours,
            median_pr_first_review_hours: metrics.medianPrFirstReviewHours,
            median_pr_merge_hours: metrics.medianPrMergeHours,
            active_contributors_30d: metrics.activeContributors30d,
            stale_issues_count: metrics.staleIssuesCount,
          })
          .execute();
      }
    } catch (error) {
      console.error(
        `Failed to snapshot initial GitHub health for ${repo.owner}/${repo.name}:`,
        error
      );
    }
  }
}
