import {
  canonicalizeFilterConfig,
  computeHealthMetrics,
  decryptToken,
  encryptToken,
  fetchGitHubHealthData,
  fetchGitHubStaleIssueCount,
  fetchGitHubStalePullRequestCount,
  FULL_FETCH_WINDOW_MS,
  mergeRawHealthData,
  parseFilterConfig,
  parseGitHubRepositoryUrl,
  type BotPattern,
  type RawGitHubHealthData,
} from '@npm-burst/github-data-access';
import type { Kysely } from 'kysely';
import { compressJson, decompressJson } from '@npm-burst/shared';
import type { DB } from './db-schema';
import { cachedFetch } from './npm-fetch';

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
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
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
  const payload = {
    iat: now - 60,
    exp: now + 9 * 60,
    iss: appId,
  };
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
  installationRow: {
    id: number;
    installation_id: number;
  },
  env: {
    GITHUB_APP_ID?: string;
    GITHUB_APP_PRIVATE_KEY?: string;
    ENCRYPTION_KEY?: string;
  }
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
    `https://api.github.com/app/installations/${installationRow.installation_id}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${jwt}`,
        'User-Agent': 'npm-burst-cron',
      },
    }
  );

  if (!response.ok) {
    console.error(
      `Failed to refresh GitHub installation token ${installationRow.installation_id}: ${response.status}`
    );
    return null;
  }

  const body = (await response.json()) as {
    token: string;
    expires_at: string;
  };
  const encrypted = await encryptToken(body.token, env.ENCRYPTION_KEY);

  await db
    .updateTable('github_installations')
    .set({
      encrypted_access_token: encrypted,
      token_expires_at: body.expires_at,
      updated_at: new Date().toISOString(),
    })
    .where('id', '=', installationRow.id)
    .execute();

  return body.token;
}

export async function getInstallationTokenForRepo(
  db: Kysely<DB>,
  installationRowId: number | null,
  env: {
    GITHUB_APP_ID?: string;
    GITHUB_APP_PRIVATE_KEY?: string;
    ENCRYPTION_KEY?: string;
  }
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

async function ensureGitHubRepoForPackage(
  db: Kysely<DB>,
  packageName: string
): Promise<void> {
  const existing = await db
    .selectFrom('github_repo_packages')
    .select('repo_id')
    .where('package_name', '=', packageName)
    .executeTakeFirst();

  if (existing) return;

  const body = await cachedFetch(
    db,
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}`
  );

  let repository: unknown = null;
  try {
    repository = (JSON.parse(body) as { repository?: unknown }).repository;
  } catch {
    return;
  }

  const parsed = parseGitHubRepositoryUrl(repository);
  if (!parsed) return;

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
    .select('id')
    .where('owner', '=', parsed.owner)
    .where('name', '=', parsed.name)
    .$narrowType<{ id: number }>()
    .executeTakeFirst();

  if (!repo?.id) return;

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

export async function snapshotGitHubHealth(
  db: Kysely<DB>,
  env: {
    GITHUB_APP_ID?: string;
    GITHUB_APP_PRIVATE_KEY?: string;
    ENCRYPTION_KEY?: string;
    INTERNAL_API_SECRET?: string;
    WORKER_SELF_URL?: string;
  }
): Promise<void> {
  const trackedPackages = await db
    .selectFrom('tracked_packages as tp')
    .innerJoin('user_tracked_packages as utp', 'utp.package_id', 'tp.id')
    .select('tp.package_name')
    .distinct()
    .execute();

  for (const row of trackedPackages) {
    await ensureGitHubRepoForPackage(db, row.package_name);
  }

  const repos = await db
    .selectFrom('github_repos as gr')
    .innerJoin('github_repo_packages as grp', 'grp.repo_id', 'gr.id')
    .innerJoin('tracked_packages as tp', 'tp.package_name', 'grp.package_name')
    .innerJoin('user_tracked_packages as utp', 'utp.package_id', 'tp.id')
    .select(['gr.id', 'gr.owner', 'gr.name', 'gr.installation_id'])
    .$narrowType<{ id: number; owner: string; name: string }>()
    .distinct()
    .execute();

  if (repos.length === 0) return;

  if (env.WORKER_SELF_URL && env.INTERNAL_API_SECRET) {
    // Fan-out: POST to self for each repo, each gets its own subrequest budget
    await Promise.allSettled(
      repos.map((repo) =>
        fetch(`${env.WORKER_SELF_URL}/api/snapshot-repo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
          },
          body: JSON.stringify({
            repoId: repo.id,
            owner: repo.owner,
            name: repo.name,
            installationId: repo.installation_id,
          }),
        }).catch((error) => {
          console.error(
            `Failed to dispatch snapshot for ${repo.owner}/${repo.name}:`,
            error
          );
        })
      )
    );
  } else {
    // Fallback: process inline (for local dev or missing config)
    const today = new Date().toISOString().slice(0, 10);
    const botPatterns = await loadBotPatterns(db);

    for (const repo of repos) {
      try {
        const token = await getInstallationTokenForRepo(
          db,
          repo.installation_id,
          env
        );
        if (!token) continue;

        await snapshotSingleRepo(db, repo, token, today);
      } catch (error) {
        console.error(
          `Failed to snapshot GitHub health for ${repo.owner}/${repo.name}:`,
          error
        );
      }
    }
  }
}

export async function snapshotSingleRepo(
  db: Kysely<DB>,
  repo: { id: number; owner: string; name: string },
  token: string,
  snapshotDate: string
): Promise<boolean> {
  // Load most recent snapshot for incremental fetch
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
      userAgent: 'npm-burst-cron',
    }
  );
  if (!delta) return false;

  const rawData = previousData
    ? mergeRawHealthData(previousData, delta.repository)
    : delta;

  const isToday = previousSnapshot?.snapshot_date === snapshotDate;
  const staleCutoffIso = new Date(
    Date.now() - FULL_FETCH_WINDOW_MS
  ).toISOString();
  let snapshotId: number | undefined;

  if (isToday && previousSnapshot?.id) {
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

  if (!snapshotId) return false;

  const filterRows = await db
    .selectFrom('github_repo_packages')
    .select('filter_config')
    .where('repo_id', '=', repo.id)
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

  for (const rawFilterConfig of filterConfigs) {
    const filterConfig = parseFilterConfig(rawFilterConfig);
    const metrics = computeHealthMetrics(rawData, filterConfig, []);
    const staleIssuesCount = await fetchGitHubStaleIssueCount(
      token,
      repo.owner,
      repo.name,
      staleCutoffIso,
      filterConfig?.labels ?? [],
      { userAgent: 'npm-burst-cron' }
    );
    const stalePrsCount = await fetchGitHubStalePullRequestCount(
      token,
      repo.owner,
      repo.name,
      staleCutoffIso,
      filterConfig?.labels ?? [],
      { userAgent: 'npm-burst-cron' }
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
      })
      .execute();
  }

  return true;
}
