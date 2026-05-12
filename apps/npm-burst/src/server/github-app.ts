import { encryptToken } from '@npm-burst/github-data-access';
import type { Kysely } from 'kysely';
import { getAuthUserId } from './auth';
import { getDb } from './db';
import type { DB } from './db-schema';
import type { Env } from './env';
import { snapshotGitHubHealthForOwner } from './github-health-snapshot';

const GITHUB_API_VERSION = '2022-11-28';

interface GitHubAccount {
  login: string;
  type: 'Organization' | 'User';
}

interface GitHubInstallationPayload {
  id: number;
  account: GitHubAccount;
}

interface GitHubInstallationWebhookPayload {
  action: string;
  installation: GitHubInstallationPayload;
}

export function getAppBasePath(_request: Request): string {
  return '';
}

export function buildGitHubAppInstallPath(
  request: Request,
  owner: string,
  returnTo: string
): string {
  const basePath = getAppBasePath(request);
  const url = new URL(
    `${basePath}/api/github/install`,
    new URL(request.url).origin
  );
  if (owner) {
    url.searchParams.set('owner', owner);
  }
  url.searchParams.set(
    'returnTo',
    sanitizeReturnTo(returnTo, `${basePath}/usage`)
  );
  return `${url.pathname}${url.search}`;
}

function sanitizeReturnTo(value: string | null, fallback: string): string {
  if (!value || !value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  return value;
}

function encodeState(state: Record<string, string>): string {
  const json = JSON.stringify(state);
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeState(value: string | null): Record<string, string> | null {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, string>;
  } catch {
    return null;
  }
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

async function verifyWebhookSignature(
  body: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = signatureHeader.slice('sha256='.length);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(body)
  );
  const actual = Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function refreshInstallationToken(
  db: Kysely<DB>,
  installation: { id: number; installation_id: number },
  env: Env
): Promise<string> {
  const jwt = await createAppJwt(
    env.GITHUB_APP_ID!,
    env.GITHUB_APP_PRIVATE_KEY!
  );
  const response = await fetch(
    `https://api.github.com/app/installations/${installation.installation_id}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        Authorization: `Bearer ${jwt}`,
        'User-Agent': 'npm-burst-app',
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to refresh installation token (${response.status})`
    );
  }

  const body = (await response.json()) as { token: string; expires_at: string };
  const encrypted = await encryptToken(body.token, env.ENCRYPTION_KEY!);

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

async function syncInstallationRepositories(
  db: Kysely<DB>,
  installation: { id: number; installation_id: number; owner: string },
  env: Env
): Promise<void> {
  const token = await refreshInstallationToken(db, installation, env);
  const response = await fetch(
    'https://api.github.com/installation/repositories',
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        Authorization: `Bearer ${token}`,
        'User-Agent': 'npm-burst-app',
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to list installation repositories (${response.status})`
    );
  }

  const body = (await response.json()) as {
    repositories: Array<{ owner: { login: string }; name: string }>;
  };

  const accessibleNames = new Set(
    body.repositories
      .filter((repo) => repo.owner.login === installation.owner)
      .map((repo) => repo.name)
  );

  await db
    .updateTable('github_repos')
    .set({ installation_id: null, updated_at: new Date().toISOString() })
    .where('owner', '=', installation.owner)
    .execute();

  for (const repoName of accessibleNames) {
    await db
      .updateTable('github_repos')
      .set({
        installation_id: installation.id,
        updated_at: new Date().toISOString(),
      })
      .where('owner', '=', installation.owner)
      .where('name', '=', repoName)
      .execute();
  }
}

async function upsertInstallation(
  db: Kysely<DB>,
  payload: GitHubInstallationPayload,
  env: Env
): Promise<void> {
  await db
    .insertInto('github_installations')
    .values({
      installation_id: payload.id,
      owner: payload.account.login,
      owner_type: payload.account.type,
    })
    .onConflict((oc) =>
      oc.column('installation_id').doUpdateSet({
        owner: payload.account.login,
        owner_type: payload.account.type,
        updated_at: new Date().toISOString(),
      })
    )
    .execute();

  const row = await db
    .selectFrom('github_installations')
    .select(['id', 'installation_id', 'owner'])
    .where('installation_id', '=', payload.id)
    .$narrowType<{ id: number; installation_id: number; owner: string }>()
    .executeTakeFirst();

  if (!row) {
    throw new Error(`Installation ${payload.id} was not persisted`);
  }

  await syncInstallationRepositories(db, row, env);
}

async function deleteInstallation(
  db: Kysely<DB>,
  installationId: number
): Promise<void> {
  const row = await db
    .selectFrom('github_installations')
    .select(['id'])
    .where('installation_id', '=', installationId)
    .$narrowType<{ id: number }>()
    .executeTakeFirst();

  if (!row) return;

  await db
    .updateTable('github_repos')
    .set({ installation_id: null, updated_at: new Date().toISOString() })
    .where('installation_id', '=', row.id)
    .execute();

  await db
    .deleteFrom('github_installations')
    .where('id', '=', row.id)
    .execute();
}

export async function handleGitHubAppInstall(
  request: Request,
  env: Env
): Promise<Response> {
  const userId = await getAuthUserId(request, env);
  if (!userId) {
    return new Response('Authentication required', { status: 401 });
  }

  if (!env.GITHUB_APP_SLUG) {
    return new Response('GitHub App is not configured', { status: 503 });
  }

  const url = new URL(request.url);
  const basePath = getAppBasePath(request);
  const fallbackReturnTo = `${basePath}/usage`;
  const owner = url.searchParams.get('owner') ?? '';
  const returnTo = sanitizeReturnTo(
    url.searchParams.get('returnTo'),
    fallbackReturnTo
  );

  const state = encodeState({
    owner,
    returnTo,
    userId,
  });

  const installUrl = new URL(
    `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`
  );
  installUrl.searchParams.set('state', state);

  return Response.redirect(installUrl.toString(), 302);
}

export async function handleGitHubAppSetup(
  request: Request
): Promise<Response> {
  const url = new URL(request.url);
  const basePath = getAppBasePath(request);
  const fallbackReturnTo = `${basePath}/usage`;
  const state = decodeState(url.searchParams.get('state'));
  const returnTo = sanitizeReturnTo(state?.returnTo ?? null, fallbackReturnTo);

  const redirect = new URL(request.url);
  redirect.pathname = returnTo;
  redirect.search = '';
  redirect.hash = '';
  redirect.searchParams.set('github-install', 'pending');
  if (state?.owner) {
    redirect.searchParams.set('owner', state.owner);
  }

  return Response.redirect(redirect.toString(), 302);
}

export async function handleGitHubWebhook(
  request: Request,
  env: Env,
  executionCtx: ExecutionContext
): Promise<Response> {
  if (!env.GITHUB_WEBHOOK_SECRET) {
    return new Response('Webhook secret not configured', { status: 503 });
  }

  const signature = request.headers.get('x-hub-signature-256');
  const event = request.headers.get('x-github-event');
  const body = await request.text();

  const valid = await verifyWebhookSignature(
    body,
    signature,
    env.GITHUB_WEBHOOK_SECRET
  );
  if (!valid) {
    return new Response('Invalid signature', { status: 401 });
  }

  if (event !== 'installation' && event !== 'installation_repositories') {
    return new Response('Ignored', { status: 202 });
  }

  const payload = JSON.parse(body) as GitHubInstallationWebhookPayload;
  const db = getDb(env);

  try {
    if (
      payload.action === 'created' ||
      payload.action === 'new_permissions_accepted' ||
      payload.action === 'unsuspend' ||
      payload.action === 'added' ||
      payload.action === 'removed'
    ) {
      await upsertInstallation(db, payload.installation, env);
      executionCtx.waitUntil(
        snapshotGitHubHealthForOwner(
          db,
          env,
          payload.installation.account.login
        ).catch((error) => {
          console.error(
            `Failed to run initial GitHub health fetch for ${payload.installation.account.login}:`,
            error
          );
        })
      );
    } else if (payload.action === 'deleted' || payload.action === 'suspend') {
      await deleteInstallation(db, payload.installation.id);
    }
  } catch (error) {
    console.error('Failed to process GitHub webhook:', error);
    return new Response('Webhook processing failed', { status: 500 });
  }

  return new Response('ok', { status: 200 });
}
