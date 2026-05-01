import {
  canonicalizeFilterConfig,
  computeHealthMetrics,
  decryptToken,
  encryptToken,
  fetchGitHubHealthData,
  fetchGitHubRepoSnapshotCounts,
  fetchGitHubStaleIssueCount,
  fetchGitHubStalePullRequestCount,
  FULL_FETCH_WINDOW_MS,
  mergeRawHealthData,
  parseFilterConfig,
  type BotPattern,
  type RawGitHubHealthData,
} from '@npm-burst/github-data-access';
import type { Kysely } from 'kysely';
import { compressJson, decompressJson } from '@npm-burst/shared';
import type { DB } from './db-schema';
import type { Env } from './env';
import { ensureGitHubRepoForPackage } from './github-health';

export interface GitHubHealthSnapshotRepo {
  id: number;
  owner: string;
  name: string;
}

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
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function createAppJwt(
  appId: string,
  privateKey: string
): Promise<string> {
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
  return `${encodedHeader}.${encodedPayload}.${toBase64Url(
    new Uint8Array(signature)
  )}`;
}

function normalizeBlob(
  value: Uint8Array | ArrayBuffer | null
): Uint8Array | null {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
}

async function refreshInstallationToken(
  db: Kysely<DB>,
  installation: { id: number; installation_id: number },
  env: Env
): Promise<string | null> {
  if (
    !env.GITHUB_APP_ID ||
    !env.GITHUB_APP_PRIVATE_KEY ||
    !env.ENCRYPTION_KEY
  ) {
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
    const body = await response.text();
    console.error(
      `Failed to refresh GitHub installation token ${installation.installation_id}: ${response.status}`,
      { body: body.slice(0, 400) }
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

async function getRepoFilterConfigs(
  db: Kysely<DB>,
  repoId: number
): Promise<Array<string | null>> {
  const filterRows = await db
    .selectFrom('github_repo_packages')
    .select('filter_config')
    .where('repo_id', '=', repoId)
    .execute();

  const seen = new Set<string | null>([null]);
  const filterConfigs = [null as string | null];

  for (const row of filterRows) {
    const normalized = canonicalizeFilterConfig(
      parseFilterConfig(row.filter_config)
    );
    if (!seen.has(normalized)) {
      seen.add(normalized);
      filterConfigs.push(normalized);
    }
  }

  return filterConfigs;
}

export async function snapshotGitHubHealthForRepo(
  db: Kysely<DB>,
  repo: GitHubHealthSnapshotRepo,
  token: string,
  snapshotDate = new Date().toISOString().slice(0, 10)
): Promise<boolean> {
  // Load the most recent snapshot to enable incremental fetch
  const previousSnapshot = await db
    .selectFrom('github_health_snapshots')
    .select(['id', 'raw_data', 'snapshot_date'])
    .where('repo_id', '=', repo.id)
    .orderBy('snapshot_date', 'desc')
    .limit(1)
    .executeTakeFirst();

  const previousData = previousSnapshot?.raw_data
    ? await decompressJson<RawGitHubHealthData>(previousSnapshot.raw_data)
    : null;

  // Incremental: fetch only items updated since last fetch; full: 91-day window
  const since =
    previousData?.fetchedAt ??
    new Date(Date.now() - FULL_FETCH_WINDOW_MS).toISOString();

  const delta = await fetchGitHubHealthData(
    token,
    repo.owner,
    repo.name,
    {
      since,
    },
    {
      userAgent: 'npm-burst-app',
    }
  );
  if (!delta) {
    return false;
  }

  // Merge delta into previous data, or use delta as-is for first fetch
  const rawData = previousData
    ? mergeRawHealthData(previousData, delta.repository)
    : delta;

  const isToday = previousSnapshot?.snapshot_date === snapshotDate;
  const [, filterConfigs, repoSnapshotCounts] = await Promise.all([
    loadBotPatterns(db),
    getRepoFilterConfigs(db, repo.id),
    fetchGitHubRepoSnapshotCounts(token, repo.owner, repo.name, {
      userAgent: 'npm-burst-app',
    }),
  ]);
  const staleCutoffIso = new Date(
    Date.now() - FULL_FETCH_WINDOW_MS
  ).toISOString();

  let snapshotId: number | undefined;

  if (isToday && previousSnapshot?.id) {
    // Update today's existing snapshot
    snapshotId = previousSnapshot.id;
    await db
      .updateTable('github_health_snapshots')
      .set({ raw_data: await compressJson(rawData) })
      .where('id', '=', snapshotId)
      .execute();

    await db
      .deleteFrom('github_health_metrics')
      .where('snapshot_id', '=', snapshotId)
      .execute();
  } else {
    // Create new snapshot for today
    snapshotId = (
      await db
        .insertInto('github_health_snapshots')
        .values({
          repo_id: repo.id,
          snapshot_date: snapshotDate,
          raw_data: await compressJson(rawData),
        })
        .returning('id')
        .$narrowType<{ id: number }>()
        .executeTakeFirst()
    )?.id;
  }

  if (!snapshotId) {
    return false;
  }

  for (const rawFilterConfig of filterConfigs) {
    const filterConfig = parseFilterConfig(rawFilterConfig);
    const metrics = computeHealthMetrics(rawData, filterConfig, []);
    const staleIssuesCount = await fetchGitHubStaleIssueCount(
      token,
      repo.owner,
      repo.name,
      staleCutoffIso,
      filterConfig?.labels ?? [],
      { userAgent: 'npm-burst-app' }
    );
    const stalePrsCount = await fetchGitHubStalePullRequestCount(
      token,
      repo.owner,
      repo.name,
      staleCutoffIso,
      filterConfig?.labels ?? [],
      { userAgent: 'npm-burst-app' }
    );

    await db
      .insertInto('github_health_metrics')
      .values({
        snapshot_id: snapshotId,
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
        stale_issues_count: staleIssuesCount,
        stale_prs_count: stalePrsCount,
        open_issues_count: repoSnapshotCounts.openIssuesCount,
        open_pull_requests_count: repoSnapshotCounts.openPullRequestsCount,
        stars_count: repoSnapshotCounts.starsCount,
      })
      .execute();
  }

  return true;
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
    .$narrowType<{
      id: number;
      owner: string;
      name: string;
      installation_id: number | null;
    }>()
    .distinct()
    .execute();

  if (repos.length === 0) {
    return;
  }

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

      await snapshotGitHubHealthForRepo(db, repo, token, today);
    } catch (error) {
      console.error(
        `Failed to snapshot initial GitHub health for ${repo.owner}/${repo.name}:`,
        error
      );
    }
  }
}
