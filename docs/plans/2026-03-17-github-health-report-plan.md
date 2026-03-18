# GitHub Repository Health Report — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Health" view mode to the package dashboard that shows GitHub repo health metrics (issues, PRs, response times) via an accordion UI with sparklines and expandable D3 charts.

**Architecture:** GitHub App authenticates via JWT → installation tokens (encrypted at rest with AES-256-GCM). A daily cron job snapshots raw GraphQL data per repo and pre-computes metrics per filter config. The frontend reads computed metrics via telefunc and renders an accordion of 12 metric rows.

**Tech Stack:** Kysely/LibSQL, Web Crypto API (AES-256-GCM), GitHub GraphQL API, D3.js, Zustand, React, Telefunc, Cloudflare Workers (cron)

---

## Task 1: Database Migration — GitHub Health Tables

**Files:**
- Create: `apps/npm-burst/src/server/migrations/2026-03-17_github_health.ts`

**Step 1: Write the migration**

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE github_installations (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      installation_id        INTEGER NOT NULL UNIQUE,
      owner                  TEXT NOT NULL,
      owner_type             TEXT NOT NULL CHECK(owner_type IN ('Organization', 'User')),
      encrypted_access_token BLOB,
      token_expires_at       TEXT,
      created_at             TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_gh_installations_owner ON github_installations(owner)
  `.execute(db);

  await sql`
    CREATE TABLE github_repos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      installation_id INTEGER REFERENCES github_installations(id) ON DELETE SET NULL,
      owner           TEXT NOT NULL,
      name            TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (owner, name)
    )
  `.execute(db);

  await sql`
    CREATE TABLE github_repo_packages (
      repo_id               INTEGER NOT NULL REFERENCES github_repos(id) ON DELETE CASCADE,
      package_name           TEXT NOT NULL,
      filter_config          TEXT,
      is_maintainer_override INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (repo_id, package_name)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_gh_repo_packages_pkg ON github_repo_packages(package_name)
  `.execute(db);

  await sql`
    CREATE TABLE github_health_snapshots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id       INTEGER NOT NULL REFERENCES github_repos(id) ON DELETE CASCADE,
      snapshot_date TEXT NOT NULL,
      raw_data      TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (repo_id, snapshot_date)
    )
  `.execute(db);

  await sql`
    CREATE TABLE github_health_metrics (
      id                                INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id                       INTEGER NOT NULL REFERENCES github_health_snapshots(id) ON DELETE CASCADE,
      repo_id                           INTEGER NOT NULL REFERENCES github_repos(id) ON DELETE CASCADE,
      filter_config                     TEXT,
      issues_opened_30d                 INTEGER NOT NULL DEFAULT 0,
      issues_closed_30d                 INTEGER NOT NULL DEFAULT 0,
      prs_opened_30d                    INTEGER NOT NULL DEFAULT 0,
      prs_merged_30d                    INTEGER NOT NULL DEFAULT 0,
      prs_closed_unmerged_30d           INTEGER NOT NULL DEFAULT 0,
      median_issue_first_response_hours REAL,
      median_issue_close_hours          REAL,
      median_pr_first_review_hours      REAL,
      median_pr_merge_hours             REAL,
      active_contributors_30d           INTEGER NOT NULL DEFAULT 0,
      stale_issues_count                INTEGER NOT NULL DEFAULT 0,
      created_at                        TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_gh_health_metrics_repo_filter
    ON github_health_metrics(repo_id, filter_config)
  `.execute(db);

  await sql`
    CREATE TABLE github_bot_patterns (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern_type  TEXT NOT NULL CHECK(pattern_type IN ('username', 'email', 'username_suffix')),
      pattern_value TEXT NOT NULL,
      created_by    TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (pattern_type, pattern_value)
    )
  `.execute(db);

  -- Seed default bot patterns
  await sql`
    INSERT INTO github_bot_patterns (pattern_type, pattern_value, created_by)
    VALUES ('username_suffix', '[bot]', 'system')
  `.execute(db);

  await sql`
    INSERT INTO github_bot_patterns (pattern_type, pattern_value, created_by)
    VALUES ('email', 'noreply@github.com', 'system')
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('github_bot_patterns').execute();
  await db.schema.dropTable('github_health_metrics').execute();
  await db.schema.dropTable('github_health_snapshots').execute();
  await db.schema.dropTable('github_repo_packages').execute();
  await db.schema.dropTable('github_repos').execute();
  await db.schema.dropTable('github_installations').execute();
}
```

**Step 2: Run the migration locally**

Run: `npx tsx apps/npm-burst/src/server/migrate.ts`
Expected: Migration applies successfully, all 6 tables created.

**Step 3: Regenerate the DB schema types**

Run: `npx kysely-codegen --out-file apps/npm-burst/src/server/db-schema.ts`
Expected: `db-schema.ts` now includes interfaces for all 6 new tables plus the existing 5.

Also copy the updated schema to the cronjob app:
Run: `cp apps/npm-burst/src/server/db-schema.ts apps/cronjob/src/db-schema.ts`

**Step 4: Commit**

```bash
git add apps/npm-burst/src/server/migrations/2026-03-17_github_health.ts apps/npm-burst/src/server/db-schema.ts apps/cronjob/src/db-schema.ts
git commit -m "feat: add database tables for GitHub health tracking"
```

---

## Task 2: Encryption Utility

Uses the Web Crypto API (available in both Node.js and Cloudflare Workers).

**Files:**
- Create: `libs/github-data-access/src/lib/crypto.ts`
- Create: `libs/github-data-access/src/lib/crypto.spec.ts`

> **Note:** We're creating a new `libs/github-data-access` library for all GitHub-related shared code. Initialize it first:
> Run: `npx nx g @nx/js:library github-data-access --directory=libs/github-data-access --unitTestRunner=vitest --bundler=none`

**Step 1: Write the failing test**

```typescript
// libs/github-data-access/src/lib/crypto.spec.ts
import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from './crypto';

describe('token encryption', () => {
  // 32 bytes hex-encoded = 64 hex chars
  const testKey = 'a'.repeat(64);

  it('round-trips a token through encrypt/decrypt', async () => {
    const plaintext = 'ghs_abc123tokenvalue';
    const encrypted = await encryptToken(plaintext, testKey);
    expect(encrypted).toBeInstanceOf(Uint8Array);
    // 12 nonce + at least 1 ciphertext byte + 16 tag = minimum 29
    expect(encrypted.byteLength).toBeGreaterThanOrEqual(29);
    const decrypted = await decryptToken(encrypted, testKey);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext', async () => {
    const plaintext = 'ghs_abc123tokenvalue';
    const a = await encryptToken(plaintext, testKey);
    const b = await encryptToken(plaintext, testKey);
    // Different nonces should produce different output
    expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'));
  });

  it('fails to decrypt with wrong key', async () => {
    const plaintext = 'ghs_abc123tokenvalue';
    const encrypted = await encryptToken(plaintext, testKey);
    const wrongKey = 'b'.repeat(64);
    await expect(decryptToken(encrypted, wrongKey)).rejects.toThrow();
  });

  it('rejects a key that is not 64 hex chars', async () => {
    await expect(encryptToken('test', 'short')).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run libs/github-data-access/src/lib/crypto.spec.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
// libs/github-data-access/src/lib/crypto.ts
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function importKey(hexKey: string): Promise<CryptoKey> {
  if (hexKey.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  const raw = hexToBytes(hexKey);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptToken(
  plaintext: string,
  hexKey: string
): Promise<Uint8Array> {
  const key = await importKey(hexKey);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    encoded
  );
  // Concatenate: nonce | ciphertext (includes auth tag appended by WebCrypto)
  const result = new Uint8Array(NONCE_LENGTH + ciphertext.byteLength);
  result.set(nonce, 0);
  result.set(new Uint8Array(ciphertext), NONCE_LENGTH);
  return result;
}

export async function decryptToken(
  encrypted: Uint8Array,
  hexKey: string
): Promise<string> {
  const key = await importKey(hexKey);
  const nonce = encrypted.slice(0, NONCE_LENGTH);
  const ciphertext = encrypted.slice(NONCE_LENGTH);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run libs/github-data-access/src/lib/crypto.spec.ts`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add libs/github-data-access/
git commit -m "feat: add AES-256-GCM encryption utility for GitHub tokens"
```

---

## Task 3: GitHub App JWT Generation

**Files:**
- Create: `libs/github-data-access/src/lib/github-jwt.ts`
- Create: `libs/github-data-access/src/lib/github-jwt.spec.ts`

**Step 1: Write the failing test**

```typescript
// libs/github-data-access/src/lib/github-jwt.spec.ts
import { describe, it, expect } from 'vitest';
import { createAppJwt } from './github-jwt';

// A minimal RSA private key for testing (DO NOT use in production)
// Generate with: openssl genrsa 2048
const TEST_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
... (use a test-only key generated at test time or a fixture) ...
-----END RSA PRIVATE KEY-----`;

describe('createAppJwt', () => {
  it('generates a JWT with correct structure', async () => {
    const jwt = await createAppJwt('12345', TEST_PRIVATE_KEY);
    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);
    // Header should specify RS256
    const header = JSON.parse(atob(parts[0]));
    expect(header.alg).toBe('RS256');
    expect(header.typ).toBe('JWT');
    // Payload should have iss = app id
    const payload = JSON.parse(atob(parts[1]));
    expect(payload.iss).toBe('12345');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run libs/github-data-access/src/lib/github-jwt.spec.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
// libs/github-data-access/src/lib/github-jwt.ts

function base64url(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
    .replace(/-----END RSA PRIVATE KEY-----/, '')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function createAppJwt(
  appId: string,
  privateKeyPem: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60, // 60s clock skew allowance
    exp: now + 600, // 10 minute expiry (GitHub maximum)
    iss: appId,
  };

  const headerB64 = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const signingInput = `${headerB64}.${payloadB64}`;

  // Determine key format based on PEM header
  const isPKCS8 = privateKeyPem.includes('BEGIN PRIVATE KEY');
  const key = await crypto.subtle.importKey(
    isPKCS8 ? 'pkcs8' : 'pkcs8', // Web Crypto only supports pkcs8
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}
```

> **Note:** GitHub requires PKCS8 format. If users provide PKCS1 (`BEGIN RSA PRIVATE KEY`), they'll need to convert. We can document this or add conversion logic later.

**Step 4: Run test to verify it passes**

Run: `npx vitest run libs/github-data-access/src/lib/github-jwt.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add libs/github-data-access/src/lib/github-jwt.ts libs/github-data-access/src/lib/github-jwt.spec.ts
git commit -m "feat: add GitHub App JWT generation using Web Crypto"
```

---

## Task 4: GitHub App Auth Service (Installation Token Management)

**Files:**
- Create: `libs/github-data-access/src/lib/github-auth.ts`
- Create: `libs/github-data-access/src/lib/github-auth.spec.ts`

**Step 1: Write the failing test**

```typescript
// libs/github-data-access/src/lib/github-auth.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubAuthService } from './github-auth';

describe('GitHubAuthService', () => {
  it('returns app JWT when no installation exists', async () => {
    const service = new GitHubAuthService({
      appId: '12345',
      privateKey: 'test-key',
      encryptionKey: 'a'.repeat(64),
      db: mockDb({ installation: null }),
    });
    const token = await service.getTokenForRepo('facebook', 'react');
    expect(token.type).toBe('app-jwt');
    expect(token.value).toBeTruthy();
  });

  it('returns cached installation token when not expired', async () => {
    const futureExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const service = new GitHubAuthService({
      appId: '12345',
      privateKey: 'test-key',
      encryptionKey: 'a'.repeat(64),
      db: mockDb({
        installation: {
          id: 1,
          installation_id: 999,
          encrypted_access_token: mockEncryptedToken,
          token_expires_at: futureExpiry,
        },
      }),
    });
    const token = await service.getTokenForRepo('facebook', 'react');
    expect(token.type).toBe('installation');
  });

  it('refreshes installation token when expired', async () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString();
    // ... test token refresh flow with mocked fetch
  });
});
```

> **Note:** Full mock setup will be determined during implementation based on exact Kysely query patterns.

**Step 2: Run test to verify it fails**

Run: `npx vitest run libs/github-data-access/src/lib/github-auth.spec.ts`
Expected: FAIL.

**Step 3: Write the implementation**

```typescript
// libs/github-data-access/src/lib/github-auth.ts
import type { Kysely } from 'kysely';
import { createAppJwt } from './github-jwt';
import { encryptToken, decryptToken } from './crypto';

interface GitHubAuthConfig {
  appId: string;
  privateKey: string;
  encryptionKey: string;
  db: Kysely<any>;
}

interface TokenResult {
  type: 'app-jwt' | 'installation';
  value: string;
}

const TOKEN_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export class GitHubAuthService {
  constructor(private config: GitHubAuthConfig) {}

  async getTokenForRepo(owner: string, _repo: string): Promise<TokenResult> {
    // Look up installation for this owner
    const installation = await this.config.db
      .selectFrom('github_installations')
      .selectAll()
      .where('owner', '=', owner)
      .executeTakeFirst();

    if (!installation) {
      const jwt = await createAppJwt(this.config.appId, this.config.privateKey);
      return { type: 'app-jwt', value: jwt };
    }

    // Check if token is still valid (with buffer)
    if (
      installation.encrypted_access_token &&
      installation.token_expires_at
    ) {
      const expiresAt = new Date(installation.token_expires_at).getTime();
      if (expiresAt - Date.now() > TOKEN_BUFFER_MS) {
        const token = await decryptToken(
          new Uint8Array(installation.encrypted_access_token),
          this.config.encryptionKey
        );
        return { type: 'installation', value: token };
      }
    }

    // Refresh the token
    return this.refreshInstallationToken(installation);
  }

  private async refreshInstallationToken(installation: {
    id: number;
    installation_id: number;
  }): Promise<TokenResult> {
    const jwt = await createAppJwt(this.config.appId, this.config.privateKey);

    const response = await fetch(
      `https://api.github.com/app/installations/${installation.installation_id}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      // Fallback to app JWT on auth failure
      return { type: 'app-jwt', value: jwt };
    }

    const data = (await response.json()) as {
      token: string;
      expires_at: string;
    };

    // Encrypt and store
    const encrypted = await encryptToken(
      data.token,
      this.config.encryptionKey
    );

    await this.config.db
      .updateTable('github_installations')
      .set({
        encrypted_access_token: Buffer.from(encrypted) as any,
        token_expires_at: data.expires_at,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', installation.id)
      .execute();

    return { type: 'installation', value: data.token };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run libs/github-data-access/src/lib/github-auth.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add libs/github-data-access/src/lib/github-auth.ts libs/github-data-access/src/lib/github-auth.spec.ts
git commit -m "feat: add GitHub installation token management with encrypted storage"
```

---

## Task 5: Bot Pattern Service

**Files:**
- Create: `libs/github-data-access/src/lib/bot-filter.ts`
- Create: `libs/github-data-access/src/lib/bot-filter.spec.ts`

**Step 1: Write the failing test**

```typescript
// libs/github-data-access/src/lib/bot-filter.spec.ts
import { describe, it, expect } from 'vitest';
import { BotFilter } from './bot-filter';

describe('BotFilter', () => {
  const filter = new BotFilter([
    { pattern_type: 'username_suffix', pattern_value: '[bot]' },
    { pattern_type: 'email', pattern_value: 'noreply@github.com' },
    { pattern_type: 'username', pattern_value: 'codecov' },
  ]);

  it('detects Bot typename', () => {
    expect(filter.isBot({ login: 'dependabot', __typename: 'Bot' })).toBe(true);
  });

  it('detects [bot] suffix', () => {
    expect(filter.isBot({ login: 'renovate[bot]', __typename: 'User' })).toBe(true);
  });

  it('detects exact username match', () => {
    expect(filter.isBot({ login: 'codecov', __typename: 'User' })).toBe(true);
  });

  it('does not flag regular users', () => {
    expect(filter.isBot({ login: 'jdoe', __typename: 'User' })).toBe(false);
  });

  it('detects email match', () => {
    expect(
      filter.isBot({ login: 'someone', __typename: 'User', email: 'noreply@github.com' })
    ).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run libs/github-data-access/src/lib/bot-filter.spec.ts`
Expected: FAIL.

**Step 3: Write the implementation**

```typescript
// libs/github-data-access/src/lib/bot-filter.ts

interface BotPattern {
  pattern_type: 'username' | 'email' | 'username_suffix';
  pattern_value: string;
}

interface GitHubAuthor {
  login: string;
  __typename: string;
  email?: string;
}

export class BotFilter {
  private usernames: Set<string>;
  private suffixes: string[];
  private emails: Set<string>;

  constructor(patterns: BotPattern[]) {
    this.usernames = new Set(
      patterns
        .filter((p) => p.pattern_type === 'username')
        .map((p) => p.pattern_value.toLowerCase())
    );
    this.suffixes = patterns
      .filter((p) => p.pattern_type === 'username_suffix')
      .map((p) => p.pattern_value.toLowerCase());
    this.emails = new Set(
      patterns
        .filter((p) => p.pattern_type === 'email')
        .map((p) => p.pattern_value.toLowerCase())
    );
  }

  isBot(author: GitHubAuthor): boolean {
    // 1. GitHub's own classification
    if (author.__typename === 'Bot') return true;

    const login = author.login.toLowerCase();

    // 2. Exact username match
    if (this.usernames.has(login)) return true;

    // 3. Suffix match
    for (const suffix of this.suffixes) {
      if (login.endsWith(suffix)) return true;
    }

    // 4. Email match
    if (author.email && this.emails.has(author.email.toLowerCase())) return true;

    return false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run libs/github-data-access/src/lib/bot-filter.spec.ts`
Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add libs/github-data-access/src/lib/bot-filter.ts libs/github-data-access/src/lib/bot-filter.spec.ts
git commit -m "feat: add bot detection filter with admin-managed patterns"
```

---

## Task 6: GitHub GraphQL Client

**Files:**
- Create: `libs/github-data-access/src/lib/github-graphql.ts`
- Create: `libs/github-data-access/src/lib/github-graphql.spec.ts`
- Create: `libs/github-data-access/src/lib/types.ts`

**Step 1: Define shared types**

```typescript
// libs/github-data-access/src/lib/types.ts

export interface HealthMetricsRow {
  issues_opened_30d: number;
  issues_closed_30d: number;
  prs_opened_30d: number;
  prs_merged_30d: number;
  prs_closed_unmerged_30d: number;
  median_issue_first_response_hours: number | null;
  median_issue_close_hours: number | null;
  median_pr_first_review_hours: number | null;
  median_pr_merge_hours: number | null;
  active_contributors_30d: number;
  stale_issues_count: number;
}

export interface HealthSnapshot {
  date: string;
  metrics: HealthMetricsRow;
}

export interface RepoHealthData {
  repo: { owner: string; name: string };
  snapshots: HealthSnapshot[];
}

export interface GraphQLIssueNode {
  createdAt: string;
  closedAt: string | null;
  timelineItems: {
    nodes: Array<{
      createdAt: string;
      author: { login: string; __typename: string; email?: string } | null;
    }>;
  };
}

export interface GraphQLPRNode {
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  reviews: {
    nodes: Array<{
      createdAt: string;
      author: { login: string; __typename: string; email?: string } | null;
    }>;
  };
}

export interface GraphQLRepoHealthResponse {
  repository: {
    issuesCreated: { totalCount: number; nodes: GraphQLIssueNode[]; pageInfo: PageInfo };
    issuesClosed: { totalCount: number };
    pullRequests: { nodes: GraphQLPRNode[]; pageInfo: PageInfo };
    staleIssues: { totalCount: number };
  };
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
```

**Step 2: Write the GraphQL query builder and client**

```typescript
// libs/github-data-access/src/lib/github-graphql.ts
import type { GraphQLRepoHealthResponse } from './types';

const REPO_HEALTH_QUERY = `
query RepoHealth($owner: String!, $name: String!, $since: DateTime!, $staleDate: DateTime!, $labels: [String!], $issuesCursor: String, $prsCursor: String) {
  repository(owner: $owner, name: $name) {
    issuesCreated: issues(
      filterBy: {since: $since, labels: $labels}
      first: 100
      after: $issuesCursor
      orderBy: {field: CREATED_AT, direction: DESC}
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        createdAt
        closedAt
        timelineItems(itemTypes: [ISSUE_COMMENT], first: 20) {
          nodes {
            ... on IssueComment {
              createdAt
              author { login __typename }
            }
          }
        }
      }
    }
    issuesClosed: issues(
      filterBy: {states: CLOSED, since: $since, labels: $labels}
      first: 1
    ) {
      totalCount
    }
    pullRequests(
      first: 100
      after: $prsCursor
      orderBy: {field: CREATED_AT, direction: DESC}
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        createdAt
        mergedAt
        closedAt
        reviews(first: 10) {
          nodes {
            createdAt
            author { login __typename }
          }
        }
      }
    }
    staleIssues: issues(
      filterBy: {states: OPEN, since: $staleDate}
      first: 1
    ) {
      totalCount
    }
  }
}
`;

export async function fetchRepoHealth(
  token: string,
  owner: string,
  name: string,
  options?: { labels?: string[] }
): Promise<GraphQLRepoHealthResponse> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const staleDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const variables: Record<string, unknown> = {
    owner,
    name,
    since,
    staleDate,
    labels: options?.labels?.length ? options.labels : null,
  };

  let allIssueNodes: GraphQLRepoHealthResponse['repository']['issuesCreated']['nodes'] = [];
  let allPRNodes: GraphQLRepoHealthResponse['repository']['pullRequests']['nodes'] = [];
  let result: GraphQLRepoHealthResponse | null = null;

  // Paginate issues and PRs
  let issuesCursor: string | null = null;
  let prsCursor: string | null = null;
  let hasMoreIssues = true;
  let hasMorePRs = true;

  while (hasMoreIssues || hasMorePRs) {
    const page = await graphqlRequest<GraphQLRepoHealthResponse>(token, REPO_HEALTH_QUERY, {
      ...variables,
      issuesCursor: hasMoreIssues ? issuesCursor : null,
      prsCursor: hasMorePRs ? prsCursor : null,
    });

    if (!result) result = page;

    if (hasMoreIssues) {
      allIssueNodes.push(...page.repository.issuesCreated.nodes);
      hasMoreIssues = page.repository.issuesCreated.pageInfo.hasNextPage;
      issuesCursor = page.repository.issuesCreated.pageInfo.endCursor;
    }

    if (hasMorePRs) {
      // Filter PRs to last 30 days (GraphQL PR list can't filter by date)
      const sinceDate = new Date(since);
      const recentPRs = page.repository.pullRequests.nodes.filter(
        (pr) => new Date(pr.createdAt) >= sinceDate
      );
      allPRNodes.push(...recentPRs);

      // If the oldest PR on this page is older than 30 days, stop paginating
      const oldestPR = page.repository.pullRequests.nodes.at(-1);
      if (!oldestPR || new Date(oldestPR.createdAt) < sinceDate) {
        hasMorePRs = false;
      } else {
        hasMorePRs = page.repository.pullRequests.pageInfo.hasNextPage;
        prsCursor = page.repository.pullRequests.pageInfo.endCursor;
      }
    }
  }

  // Assemble final result with all pages
  result!.repository.issuesCreated.nodes = allIssueNodes;
  result!.repository.pullRequests.nodes = allPRNodes;

  return result!;
}

async function graphqlRequest<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`GitHub GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`);
  }
  if (!json.data) {
    throw new Error('No data in GitHub GraphQL response');
  }
  return json.data;
}
```

**Step 3: Commit**

```bash
git add libs/github-data-access/src/lib/github-graphql.ts libs/github-data-access/src/lib/types.ts
git commit -m "feat: add GitHub GraphQL client for repo health queries"
```

---

## Task 7: Health Metrics Computation

**Files:**
- Create: `libs/github-data-access/src/lib/compute-metrics.ts`
- Create: `libs/github-data-access/src/lib/compute-metrics.spec.ts`

**Step 1: Write the failing test**

```typescript
// libs/github-data-access/src/lib/compute-metrics.spec.ts
import { describe, it, expect } from 'vitest';
import { computeHealthMetrics } from './compute-metrics';
import { BotFilter } from './bot-filter';
import type { GraphQLRepoHealthResponse } from './types';

const botFilter = new BotFilter([
  { pattern_type: 'username_suffix', pattern_value: '[bot]' },
]);

describe('computeHealthMetrics', () => {
  it('counts issues opened and closed', () => {
    const response = makeResponse({
      issuesCreatedCount: 10,
      issuesClosedCount: 7,
      issueNodes: [],
      prNodes: [],
      staleCount: 3,
    });
    const metrics = computeHealthMetrics(response, botFilter);
    expect(metrics.issues_opened_30d).toBe(10);
    expect(metrics.issues_closed_30d).toBe(7);
    expect(metrics.stale_issues_count).toBe(3);
  });

  it('computes median issue first response time excluding bots', () => {
    const now = Date.now();
    const response = makeResponse({
      issuesCreatedCount: 2,
      issuesClosedCount: 0,
      issueNodes: [
        {
          createdAt: new Date(now - 10 * 3600_000).toISOString(), // 10h ago
          closedAt: null,
          timelineItems: {
            nodes: [
              // Bot comment at 1h — should be ignored
              { createdAt: new Date(now - 9 * 3600_000).toISOString(), author: { login: 'stale[bot]', __typename: 'Bot' } },
              // Human comment at 4h
              { createdAt: new Date(now - 6 * 3600_000).toISOString(), author: { login: 'maintainer', __typename: 'User' } },
            ],
          },
        },
        {
          createdAt: new Date(now - 20 * 3600_000).toISOString(), // 20h ago
          closedAt: null,
          timelineItems: {
            nodes: [
              // Human comment at 2h
              { createdAt: new Date(now - 18 * 3600_000).toISOString(), author: { login: 'other', __typename: 'User' } },
            ],
          },
        },
      ],
      prNodes: [],
      staleCount: 0,
    });
    const metrics = computeHealthMetrics(response, botFilter);
    // Issue 1: created 10h ago, first human response 6h ago = 4h response time
    // Issue 2: created 20h ago, first human response 18h ago = 2h response time
    // Median of [2, 4] = 3
    expect(metrics.median_issue_first_response_hours).toBe(3);
  });

  it('counts active contributors from issue and PR authors', () => {
    // ... test unique contributor counting
  });
});

// Helper to build a mock GraphQL response
function makeResponse(opts: {
  issuesCreatedCount: number;
  issuesClosedCount: number;
  issueNodes: any[];
  prNodes: any[];
  staleCount: number;
}): GraphQLRepoHealthResponse {
  return {
    repository: {
      issuesCreated: {
        totalCount: opts.issuesCreatedCount,
        nodes: opts.issueNodes,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      issuesClosed: { totalCount: opts.issuesClosedCount },
      pullRequests: {
        nodes: opts.prNodes,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      staleIssues: { totalCount: opts.staleCount },
    },
  };
}
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run libs/github-data-access/src/lib/compute-metrics.spec.ts`
Expected: FAIL.

**Step 3: Write the implementation**

```typescript
// libs/github-data-access/src/lib/compute-metrics.ts
import type { BotFilter } from './bot-filter';
import type { GraphQLRepoHealthResponse, HealthMetricsRow } from './types';

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function hoursBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
}

export function computeHealthMetrics(
  data: GraphQLRepoHealthResponse,
  botFilter: BotFilter
): HealthMetricsRow {
  const repo = data.repository;

  // Issue metrics
  const issueResponseTimes: number[] = [];
  const issueCloseTimes: number[] = [];
  const contributors = new Set<string>();

  for (const issue of repo.issuesCreated.nodes) {
    // First human comment
    const firstHumanComment = issue.timelineItems.nodes.find(
      (c) => c.author && !botFilter.isBot(c.author)
    );
    if (firstHumanComment) {
      issueResponseTimes.push(hoursBetween(issue.createdAt, firstHumanComment.createdAt));
    }
    if (issue.closedAt) {
      issueCloseTimes.push(hoursBetween(issue.createdAt, issue.closedAt));
    }
    // Track contributors from comments
    for (const comment of issue.timelineItems.nodes) {
      if (comment.author && !botFilter.isBot(comment.author)) {
        contributors.add(comment.author.login);
      }
    }
  }

  // PR metrics
  const prReviewTimes: number[] = [];
  const prMergeTimes: number[] = [];
  let prsMerged = 0;
  let prsClosedUnmerged = 0;

  for (const pr of repo.pullRequests.nodes) {
    // First human review
    const firstHumanReview = pr.reviews.nodes.find(
      (r) => r.author && !botFilter.isBot(r.author)
    );
    if (firstHumanReview) {
      prReviewTimes.push(hoursBetween(pr.createdAt, firstHumanReview.createdAt));
    }
    if (pr.mergedAt) {
      prsMerged++;
      prMergeTimes.push(hoursBetween(pr.createdAt, pr.mergedAt));
    } else if (pr.closedAt) {
      prsClosedUnmerged++;
    }
    // Track contributors from reviews
    for (const review of pr.reviews.nodes) {
      if (review.author && !botFilter.isBot(review.author)) {
        contributors.add(review.author.login);
      }
    }
  }

  return {
    issues_opened_30d: repo.issuesCreated.totalCount,
    issues_closed_30d: repo.issuesClosed.totalCount,
    prs_opened_30d: repo.pullRequests.nodes.length,
    prs_merged_30d: prsMerged,
    prs_closed_unmerged_30d: prsClosedUnmerged,
    median_issue_first_response_hours: median(issueResponseTimes),
    median_issue_close_hours: median(issueCloseTimes),
    median_pr_first_review_hours: median(prReviewTimes),
    median_pr_merge_hours: median(prMergeTimes),
    active_contributors_30d: contributors.size,
    stale_issues_count: repo.staleIssues.totalCount,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run libs/github-data-access/src/lib/compute-metrics.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add libs/github-data-access/src/lib/compute-metrics.ts libs/github-data-access/src/lib/compute-metrics.spec.ts
git commit -m "feat: add health metrics computation with bot filtering"
```

---

## Task 8: Repo Auto-Detection from npm Registry

**Files:**
- Create: `libs/github-data-access/src/lib/resolve-repo.ts`
- Create: `libs/github-data-access/src/lib/resolve-repo.spec.ts`

**Step 1: Write the failing test**

```typescript
// libs/github-data-access/src/lib/resolve-repo.spec.ts
import { describe, it, expect } from 'vitest';
import { parseGitHubRepo } from './resolve-repo';

describe('parseGitHubRepo', () => {
  it('parses github.com HTTPS URL', () => {
    expect(parseGitHubRepo('https://github.com/nrwl/nx')).toEqual({ owner: 'nrwl', name: 'nx' });
  });

  it('parses github.com HTTPS URL with .git suffix', () => {
    expect(parseGitHubRepo('https://github.com/nrwl/nx.git')).toEqual({ owner: 'nrwl', name: 'nx' });
  });

  it('parses git+https URL', () => {
    expect(parseGitHubRepo('git+https://github.com/facebook/react.git')).toEqual({ owner: 'facebook', name: 'react' });
  });

  it('parses SSH URL', () => {
    expect(parseGitHubRepo('git@github.com:nrwl/nx.git')).toEqual({ owner: 'nrwl', name: 'nx' });
  });

  it('parses URL with /tree/ path', () => {
    expect(parseGitHubRepo('https://github.com/nrwl/nx/tree/master/packages/nx')).toEqual({ owner: 'nrwl', name: 'nx' });
  });

  it('returns null for non-GitHub URL', () => {
    expect(parseGitHubRepo('https://gitlab.com/foo/bar')).toBeNull();
  });

  it('returns null for empty/null', () => {
    expect(parseGitHubRepo('')).toBeNull();
    expect(parseGitHubRepo(undefined as any)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run libs/github-data-access/src/lib/resolve-repo.spec.ts`
Expected: FAIL.

**Step 3: Write the implementation**

```typescript
// libs/github-data-access/src/lib/resolve-repo.ts

export interface GitHubRepoRef {
  owner: string;
  name: string;
}

export function parseGitHubRepo(url: string | undefined | null): GitHubRepoRef | null {
  if (!url) return null;

  // SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/.]+)/);
  if (sshMatch) return { owner: sshMatch[1], name: sshMatch[2] };

  // HTTPS format: https://github.com/owner/repo[.git][/...]
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.#]+)/);
  if (httpsMatch) return { owner: httpsMatch[1], name: httpsMatch[2] };

  return null;
}

export async function resolveRepoForPackage(
  packageName: string
): Promise<GitHubRepoRef | null> {
  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName).replace('%40', '@')}`;
  const response = await fetch(registryUrl);
  if (!response.ok) return null;

  const data = (await response.json()) as {
    repository?: { type?: string; url?: string } | string;
  };

  const repoField = data.repository;
  if (!repoField) return null;

  const url = typeof repoField === 'string' ? repoField : repoField.url;
  return parseGitHubRepo(url ?? null);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run libs/github-data-access/src/lib/resolve-repo.spec.ts`
Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add libs/github-data-access/src/lib/resolve-repo.ts libs/github-data-access/src/lib/resolve-repo.spec.ts
git commit -m "feat: add GitHub repo auto-detection from npm registry metadata"
```

---

## Task 9: Library Index Exports

**Files:**
- Modify: `libs/github-data-access/src/index.ts`

**Step 1: Export all public APIs**

```typescript
// libs/github-data-access/src/index.ts
export { encryptToken, decryptToken } from './lib/crypto';
export { createAppJwt } from './lib/github-jwt';
export { GitHubAuthService } from './lib/github-auth';
export { BotFilter } from './lib/bot-filter';
export { fetchRepoHealth } from './lib/github-graphql';
export { computeHealthMetrics } from './lib/compute-metrics';
export { parseGitHubRepo, resolveRepoForPackage } from './lib/resolve-repo';
export type {
  HealthMetricsRow,
  HealthSnapshot,
  RepoHealthData,
  GitHubRepoRef,
} from './lib/types';
export type { GitHubRepoRef as RepoRef } from './lib/resolve-repo';
```

**Step 2: Commit**

```bash
git add libs/github-data-access/src/index.ts
git commit -m "feat: export all github-data-access public APIs"
```

---

## Task 10: Cron Job — GitHub Health Snapshot Collection

**Files:**
- Modify: `apps/cronjob/src/env.ts` — Add new env vars
- Modify: `apps/cronjob/src/cron.ts` — Add health snapshot job
- Create: `apps/cronjob/src/github-health-cron.ts` — Health snapshot logic

**Step 1: Update the env schema**

In `apps/cronjob/src/env.ts`, add:

```typescript
const envSchema = z.object({
  TURSO_DATABASE_URL: z.string(),
  TURSO_AUTH_TOKEN: z.string(),
  GITHUB_APP_ID: z.string(),
  GITHUB_APP_PRIVATE_KEY: z.string(),
  ENCRYPTION_KEY: z.string(),
});
```

**Step 2: Create the health snapshot cron function**

```typescript
// apps/cronjob/src/github-health-cron.ts
import { Kysely } from 'kysely';
import {
  GitHubAuthService,
  BotFilter,
  fetchRepoHealth,
  computeHealthMetrics,
} from '@npm-burst/github-data-access';
import type { DB } from './db-schema';

interface HealthCronConfig {
  db: Kysely<DB>;
  appId: string;
  privateKey: string;
  encryptionKey: string;
}

export async function handleGitHubHealthCron(config: HealthCronConfig): Promise<void> {
  const { db, appId, privateKey, encryptionKey } = config;
  const today = new Date().toISOString().split('T')[0];

  const authService = new GitHubAuthService({ appId, privateKey, encryptionKey, db: db as any });

  // Load bot patterns once
  const patterns = await db
    .selectFrom('github_bot_patterns')
    .select(['pattern_type', 'pattern_value'])
    .execute();
  const botFilter = new BotFilter(patterns as any);

  // Get all repos that have at least one tracked package linked
  const repos = await db
    .selectFrom('github_repos as gr')
    .innerJoin('github_repo_packages as grp', 'gr.id', 'grp.repo_id')
    .select(['gr.id', 'gr.owner', 'gr.name'])
    .distinct()
    .execute();

  for (const repo of repos) {
    // Skip if already snapshotted today
    const existing = await db
      .selectFrom('github_health_snapshots')
      .select('id')
      .where('repo_id', '=', repo.id)
      .where('snapshot_date', '=', today)
      .executeTakeFirst();

    if (existing) continue;

    try {
      const token = await authService.getTokenForRepo(repo.owner, repo.name);

      // Fetch raw data (unfiltered)
      const rawData = await fetchRepoHealth(token.value, repo.owner, repo.name);

      // Store snapshot with raw data
      const snapshot = await db
        .insertInto('github_health_snapshots')
        .values({
          repo_id: repo.id,
          snapshot_date: today,
          raw_data: JSON.stringify(rawData),
        })
        .onConflict((oc) => oc.columns(['repo_id', 'snapshot_date']).doNothing())
        .returning('id')
        .executeTakeFirstOrThrow();

      // Compute unfiltered metrics
      const unfilteredMetrics = computeHealthMetrics(rawData, botFilter);
      await db
        .insertInto('github_health_metrics')
        .values({
          snapshot_id: snapshot.id,
          repo_id: repo.id,
          filter_config: null,
          ...unfilteredMetrics,
        })
        .execute();

      // Get distinct filter configs for this repo's packages
      const filterConfigs = await db
        .selectFrom('github_repo_packages')
        .select('filter_config')
        .where('repo_id', '=', repo.id)
        .where('filter_config', 'is not', null)
        .distinct()
        .execute();

      for (const { filter_config } of filterConfigs) {
        if (!filter_config) continue;
        const parsed = JSON.parse(filter_config) as { labels?: string[] };

        // Fetch filtered data if labels are specified
        let filteredData = rawData;
        if (parsed.labels?.length) {
          filteredData = await fetchRepoHealth(token.value, repo.owner, repo.name, {
            labels: parsed.labels,
          });
        }

        const filteredMetrics = computeHealthMetrics(filteredData, botFilter);
        await db
          .insertInto('github_health_metrics')
          .values({
            snapshot_id: snapshot.id,
            repo_id: repo.id,
            filter_config,
            ...filteredMetrics,
          })
          .execute();
      }
    } catch (e) {
      console.error(`Failed to snapshot health for ${repo.owner}/${repo.name}:`, e);
    }
  }
}
```

**Step 3: Wire into the main cron handler**

Modify `apps/cronjob/src/cron.ts` — at the end of `handleCron`, add:

```typescript
import { handleGitHubHealthCron } from './github-health-cron';

// ... existing handleCron code ...

// After existing npm snapshot loop, add:
await handleGitHubHealthCron({
  db,
  appId: env.GITHUB_APP_ID,
  privateKey: env.GITHUB_APP_PRIVATE_KEY,
  encryptionKey: env.ENCRYPTION_KEY,
});
```

**Step 4: Commit**

```bash
git add apps/cronjob/src/
git commit -m "feat: add daily GitHub health snapshot collection to cron job"
```

---

## Task 11: Telefunc — Health Metrics API

**Files:**
- Create: `apps/npm-burst/src/server/functions/health.telefunc.ts`

**Step 1: Write the telefunc function**

```typescript
// apps/npm-burst/src/server/functions/health.telefunc.ts
import { getContext } from 'telefunc';
import { getDb } from '../db';
import { isDevMode } from '../env';
import { resolveRepoForPackage } from '@npm-burst/github-data-access';

export interface HealthMetricSnapshot {
  date: string;
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
}

export interface HealthData {
  repo: { owner: string; name: string } | null;
  snapshots: HealthMetricSnapshot[];
}

export async function onGetHealthData(packageName: string): Promise<HealthData> {
  const { env } = getContext();

  if (isDevMode(env)) {
    return { repo: null, snapshots: [] };
  }

  const db = getDb(env);

  // Look up repo for this package
  const repoPackage = await db
    .selectFrom('github_repo_packages as grp')
    .innerJoin('github_repos as gr', 'grp.repo_id', 'gr.id')
    .select(['gr.owner', 'gr.name', 'gr.id as repo_id', 'grp.filter_config'])
    .where('grp.package_name', '=', packageName)
    .executeTakeFirst();

  if (!repoPackage) {
    // Try auto-detecting and return empty if not found
    return { repo: null, snapshots: [] };
  }

  // Query metrics for this repo + filter config, ordered by date
  const metrics = await db
    .selectFrom('github_health_metrics as ghm')
    .innerJoin('github_health_snapshots as ghs', 'ghm.snapshot_id', 'ghs.id')
    .select([
      'ghs.snapshot_date',
      'ghm.issues_opened_30d',
      'ghm.issues_closed_30d',
      'ghm.prs_opened_30d',
      'ghm.prs_merged_30d',
      'ghm.prs_closed_unmerged_30d',
      'ghm.median_issue_first_response_hours',
      'ghm.median_issue_close_hours',
      'ghm.median_pr_first_review_hours',
      'ghm.median_pr_merge_hours',
      'ghm.active_contributors_30d',
      'ghm.stale_issues_count',
    ])
    .where('ghm.repo_id', '=', repoPackage.repo_id)
    .where(
      'ghm.filter_config',
      repoPackage.filter_config ? '=' : 'is',
      repoPackage.filter_config ?? null
    )
    .orderBy('ghs.snapshot_date', 'asc')
    .execute();

  return {
    repo: { owner: repoPackage.owner, name: repoPackage.name },
    snapshots: metrics.map((m) => ({
      date: m.snapshot_date,
      issuesOpened30d: m.issues_opened_30d,
      issuesClosed30d: m.issues_closed_30d,
      prsOpened30d: m.prs_opened_30d,
      prsMerged30d: m.prs_merged_30d,
      prsClosedUnmerged30d: m.prs_closed_unmerged_30d,
      medianIssueFirstResponseHours: m.median_issue_first_response_hours,
      medianIssueCloseHours: m.median_issue_close_hours,
      medianPrFirstReviewHours: m.median_pr_first_review_hours,
      medianPrMergeHours: m.median_pr_merge_hours,
      activeContributors30d: m.active_contributors_30d,
      staleIssuesCount: m.stale_issues_count,
    })),
  };
}
```

**Step 2: Commit**

```bash
git add apps/npm-burst/src/server/functions/health.telefunc.ts
git commit -m "feat: add telefunc endpoint for health metrics"
```

---

## Task 12: Telefunc — Repo Resolution & Linking

**Files:**
- Create: `apps/npm-burst/src/server/functions/repo.telefunc.ts`

**Step 1: Write the telefunc**

This handles auto-detecting a repo for a package and inserting into the DB if not already linked.

```typescript
// apps/npm-burst/src/server/functions/repo.telefunc.ts
import { getContext, Abort } from 'telefunc';
import { getDb } from '../db';
import { isDevMode } from '../env';
import { resolveRepoForPackage, parseGitHubRepo } from '@npm-burst/github-data-access';

export async function onResolvePackageRepo(packageName: string): Promise<{
  owner: string;
  name: string;
} | null> {
  const { env } = getContext();
  if (isDevMode(env)) return null;

  const db = getDb(env);

  // Check if already linked
  const existing = await db
    .selectFrom('github_repo_packages as grp')
    .innerJoin('github_repos as gr', 'grp.repo_id', 'gr.id')
    .select(['gr.owner', 'gr.name'])
    .where('grp.package_name', '=', packageName)
    .executeTakeFirst();

  if (existing) return { owner: existing.owner, name: existing.name };

  // Auto-detect from npm registry
  const repo = await resolveRepoForPackage(packageName);
  if (!repo) return null;

  // Ensure github_repos row exists
  await db
    .insertInto('github_repos')
    .values({ owner: repo.owner, name: repo.name })
    .onConflict((oc) => oc.columns(['owner', 'name']).doNothing())
    .execute();

  const repoRow = await db
    .selectFrom('github_repos')
    .select('id')
    .where('owner', '=', repo.owner)
    .where('name', '=', repo.name)
    .executeTakeFirstOrThrow();

  // Link package to repo
  await db
    .insertInto('github_repo_packages')
    .values({
      repo_id: repoRow.id,
      package_name: packageName,
      is_maintainer_override: 0,
    })
    .onConflict((oc) => oc.columns(['repo_id', 'package_name']).doNothing())
    .execute();

  return repo;
}

export async function onSetPackageRepo(
  packageName: string,
  repoUrl: string
): Promise<void> {
  const { env, userId } = getContext();
  if (!userId) throw new Abort();
  if (isDevMode(env)) return;

  // TODO: verify user is a maintainer of this package before allowing override

  const db = getDb(env);
  const parsed = parseGitHubRepo(repoUrl);
  if (!parsed) throw new Abort();

  // Ensure github_repos row exists
  await db
    .insertInto('github_repos')
    .values({ owner: parsed.owner, name: parsed.name })
    .onConflict((oc) => oc.columns(['owner', 'name']).doNothing())
    .execute();

  const repoRow = await db
    .selectFrom('github_repos')
    .select('id')
    .where('owner', '=', parsed.owner)
    .where('name', '=', parsed.name)
    .executeTakeFirstOrThrow();

  // Upsert package-repo link
  await db
    .insertInto('github_repo_packages')
    .values({
      repo_id: repoRow.id,
      package_name: packageName,
      is_maintainer_override: 1,
    })
    .onConflict((oc) =>
      oc.columns(['repo_id', 'package_name']).doUpdateSet({
        is_maintainer_override: 1,
      })
    )
    .execute();
}

export async function onSetPackageFilterConfig(
  packageName: string,
  filterConfig: { labels?: string[] } | null
): Promise<void> {
  const { env, userId } = getContext();
  if (!userId) throw new Abort();
  if (isDevMode(env)) return;

  // TODO: verify user is a maintainer

  const db = getDb(env);
  await db
    .updateTable('github_repo_packages')
    .set({ filter_config: filterConfig ? JSON.stringify(filterConfig) : null })
    .where('package_name', '=', packageName)
    .execute();
}
```

**Step 2: Commit**

```bash
git add apps/npm-burst/src/server/functions/repo.telefunc.ts
git commit -m "feat: add telefunc endpoints for repo resolution and maintainer settings"
```

---

## Task 13: Update Main App Env Schema

**Files:**
- Modify: `apps/npm-burst/src/server/env.ts`

**Step 1: Add GitHub App env vars to both dev and prod schemas**

```typescript
// Add to prodSchema:
GITHUB_APP_ID: z.string(),
GITHUB_APP_PRIVATE_KEY: z.string(),
ENCRYPTION_KEY: z.string(),

// Add to devSchema (all optional):
GITHUB_APP_ID: z.string().optional(),
GITHUB_APP_PRIVATE_KEY: z.string().optional(),
ENCRYPTION_KEY: z.string().optional(),
```

**Step 2: Commit**

```bash
git add apps/npm-burst/src/server/env.ts
git commit -m "feat: add GitHub App env vars to server env schema"
```

---

## Task 14: Store — Add Health View Mode

**Files:**
- Modify: `apps/npm-burst/src/app/store/app-store.ts`

**Step 1: Add 'health' to the viewMode union type**

At line 55, change:
```typescript
viewMode: 'sunburst' | 'adoption' | 'migration' | 'lifecycle';
```
to:
```typescript
viewMode: 'sunburst' | 'adoption' | 'migration' | 'lifecycle' | 'health';
```

Also update the `setViewMode` signature to match (search for the setter type).

**Step 2: Commit**

```bash
git add apps/npm-burst/src/app/store/app-store.ts
git commit -m "feat: add health to view mode type in app store"
```

---

## Task 15: Dashboard Header — Add Health View Mode Option

**Files:**
- Modify: `apps/npm-burst/src/app/components/dashboard-header.tsx`

**Step 1: Add 'Health' to the VIEW_MODES array**

At line 10-15, add:
```typescript
const VIEW_MODES: { value: AppState['viewMode']; label: string }[] = [
  { value: 'sunburst', label: 'Breakdown' },
  { value: 'adoption', label: 'Adoption' },
  { value: 'migration', label: 'Migration' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'health', label: 'Health' },
];
```

**Step 2: Commit**

```bash
git add apps/npm-burst/src/app/components/dashboard-header.tsx
git commit -m "feat: add Health option to view mode selector"
```

---

## Task 16: Sparkline Component

**Files:**
- Create: `apps/npm-burst/src/app/components/sparkline.tsx`

**Step 1: Write the component**

```typescript
// apps/npm-burst/src/app/components/sparkline.tsx
import { memo, useMemo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export const Sparkline = memo(function Sparkline({
  data,
  width = 120,
  height = 24,
  color = 'var(--text-secondary)',
}: SparklineProps) {
  const path = useMemo(() => {
    if (data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 2;
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;
    const stepX = innerW / (data.length - 1);

    return data
      .map((v, i) => {
        const x = padding + i * stepX;
        const y = padding + innerH - ((v - min) / range) * innerH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [data, width, height]);

  if (data.length < 2) return null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
});
```

**Step 2: Commit**

```bash
git add apps/npm-burst/src/app/components/sparkline.tsx
git commit -m "feat: add Sparkline SVG component for health metric trends"
```

---

## Task 17: Health Accordion Component

**Files:**
- Create: `apps/npm-burst/src/app/components/health-accordion.tsx`
- Create: `apps/npm-burst/src/app/components/health-accordion.module.scss`

**Step 1: Write the accordion component**

```typescript
// apps/npm-burst/src/app/components/health-accordion.tsx
import { useState, memo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Sparkline } from './sparkline';
import { HealthMetricChart } from './health-metric-chart';
import type { HealthMetricSnapshot } from '../../server/functions/health.telefunc';
import styles from './health-accordion.module.scss';

interface MetricDefinition {
  key: keyof HealthMetricSnapshot;
  label: string;
  format: (v: number | null) => string;
  unit?: string;
}

const METRICS: MetricDefinition[] = [
  { key: 'issuesOpened30d', label: 'Issues Opened (30d)', format: (v) => String(v ?? 0) },
  { key: 'issuesClosed30d', label: 'Issues Closed (30d)', format: (v) => String(v ?? 0) },
  {
    key: 'issuesOpened30d',
    label: 'Open / Close Ratio',
    format: (_v, _row) => '—', // Computed separately
  },
  {
    key: 'medianIssueFirstResponseHours',
    label: 'Median Issue First Response',
    format: (v) => (v != null ? `${v.toFixed(1)}h` : '—'),
  },
  {
    key: 'medianIssueCloseHours',
    label: 'Median Issue Close Time',
    format: (v) => (v != null ? `${v.toFixed(1)}h` : '—'),
  },
  { key: 'prsOpened30d', label: 'PRs Opened (30d)', format: (v) => String(v ?? 0) },
  { key: 'prsMerged30d', label: 'PRs Merged (30d)', format: (v) => String(v ?? 0) },
  { key: 'prsClosedUnmerged30d', label: 'PRs Closed Unmerged (30d)', format: (v) => String(v ?? 0) },
  {
    key: 'medianPrFirstReviewHours',
    label: 'Median PR First Review',
    format: (v) => (v != null ? `${v.toFixed(1)}h` : '—'),
  },
  {
    key: 'medianPrMergeHours',
    label: 'Median PR Merge Time',
    format: (v) => (v != null ? `${v.toFixed(1)}h` : '—'),
  },
  { key: 'activeContributors30d', label: 'Active Contributors (30d)', format: (v) => String(v ?? 0) },
  { key: 'staleIssuesCount', label: 'Stale Issues (>90d)', format: (v) => String(v ?? 0) },
];

interface HealthAccordionProps {
  snapshots: HealthMetricSnapshot[];
}

export const HealthAccordion = memo(function HealthAccordion({ snapshots }: HealthAccordionProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (snapshots.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No health data available yet. Data is collected daily.</p>
      </div>
    );
  }

  const latest = snapshots[snapshots.length - 1];

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className={styles.accordion}>
      {METRICS.map((metric) => {
        const isOpen = expanded.has(metric.key + metric.label);
        const values = snapshots.map((s) => {
          if (metric.label === 'Open / Close Ratio') {
            return s.issuesClosed30d > 0
              ? s.issuesOpened30d / s.issuesClosed30d
              : s.issuesOpened30d > 0
                ? Infinity
                : 0;
          }
          return (s[metric.key] as number) ?? 0;
        });

        const currentValue =
          metric.label === 'Open / Close Ratio'
            ? latest.issuesClosed30d > 0
              ? (latest.issuesOpened30d / latest.issuesClosed30d).toFixed(2)
              : '—'
            : metric.format(latest[metric.key] as number | null);

        return (
          <div key={metric.key + metric.label} className={styles.row}>
            <button
              className={styles.rowHeader}
              onClick={() => toggle(metric.key + metric.label)}
            >
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span className={styles.metricLabel}>{metric.label}</span>
              <span className={styles.metricValue}>{currentValue}</span>
              <Sparkline data={values.filter((v) => isFinite(v))} />
            </button>
            {isOpen && (
              <div className={styles.rowContent}>
                <HealthMetricChart
                  dates={snapshots.map((s) => s.date)}
                  values={values}
                  label={metric.label}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
```

**Step 2: Write the styles**

```scss
// apps/npm-burst/src/app/components/health-accordion.module.scss
.accordion {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--border-subtle, #e0e0e0);
  border-radius: 8px;
  overflow: hidden;
}

.row {
  background: var(--bg-surface, #fff);
}

.rowHeader {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
  text-align: left;
  color: var(--text-primary);

  &:hover {
    background: var(--bg-hover, #f5f5f5);
  }
}

.metricLabel {
  flex: 1;
  font-weight: 500;
}

.metricValue {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  min-width: 60px;
  text-align: right;
}

.rowContent {
  padding: 16px;
  border-top: 1px solid var(--border-subtle, #e0e0e0);
}

.empty {
  text-align: center;
  padding: 48px 24px;
  color: var(--text-secondary);
}
```

**Step 3: Commit**

```bash
git add apps/npm-burst/src/app/components/health-accordion.tsx apps/npm-burst/src/app/components/health-accordion.module.scss
git commit -m "feat: add health accordion component with sparklines"
```

---

## Task 18: Health Metric Chart (D3 Expanded View)

**Files:**
- Create: `apps/npm-burst/src/app/components/health-metric-chart.tsx`

**Step 1: Write the D3 chart component**

Follow the same D3 pattern as `download-volume-chart.tsx` — SVG ref, useEffect for rendering, margins, axes, line, tooltips.

```typescript
// apps/npm-burst/src/app/components/health-metric-chart.tsx
import { useEffect, useRef, memo } from 'react';
import * as d3 from 'd3';
import { useTheme } from '../context/theme-context';
import { getThemeChartColors } from '../utils/theme-colors';

interface HealthMetricChartProps {
  dates: string[];
  values: number[];
  label: string;
}

const MARGIN = { top: 20, right: 20, bottom: 40, left: 60 };

export const HealthMetricChart = memo(function HealthMetricChart({
  dates,
  values,
  label,
}: HealthMetricChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const container = containerRef.current;
    if (!svg || !container || dates.length === 0) return;

    svg.selectAll('*').remove();

    const width = container.clientWidth;
    const height = 200;
    svg.attr('width', width).attr('height', height);

    const colors = getThemeChartColors(theme);
    const finiteValues = values.filter((v) => isFinite(v));
    const dataPoints = dates.map((d, i) => ({
      date: new Date(d),
      value: isFinite(values[i]) ? values[i] : 0,
    }));

    const x = d3
      .scaleTime()
      .domain(d3.extent(dataPoints, (d) => d.date) as [Date, Date])
      .range([MARGIN.left, width - MARGIN.right]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(finiteValues) ?? 1])
      .nice()
      .range([height - MARGIN.bottom, MARGIN.top]);

    // Axes
    svg
      .append('g')
      .attr('transform', `translate(0,${height - MARGIN.bottom})`)
      .call(d3.axisBottom(x).ticks(6))
      .attr('color', colors.axis);

    svg
      .append('g')
      .attr('transform', `translate(${MARGIN.left},0)`)
      .call(d3.axisLeft(y).ticks(5))
      .attr('color', colors.axis);

    // Line
    const line = d3
      .line<{ date: Date; value: number }>()
      .x((d) => x(d.date))
      .y((d) => y(d.value));

    svg
      .append('path')
      .datum(dataPoints)
      .attr('fill', 'none')
      .attr('stroke', colors.primary ?? 'steelblue')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Area fill
    const area = d3
      .area<{ date: Date; value: number }>()
      .x((d) => x(d.date))
      .y0(y(0))
      .y1((d) => y(d.value));

    svg
      .append('path')
      .datum(dataPoints)
      .attr('fill', colors.primary ?? 'steelblue')
      .attr('fill-opacity', 0.1)
      .attr('d', area);

    // Dots
    svg
      .selectAll('circle')
      .data(dataPoints)
      .join('circle')
      .attr('cx', (d) => x(d.date))
      .attr('cy', (d) => y(d.value))
      .attr('r', 3)
      .attr('fill', colors.primary ?? 'steelblue');
  }, [dates, values, label, theme]);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg ref={svgRef} />
    </div>
  );
});
```

**Step 2: Commit**

```bash
git add apps/npm-burst/src/app/components/health-metric-chart.tsx
git commit -m "feat: add D3 line chart for expanded health metric view"
```

---

## Task 19: Health Data Fetching Hook

**Files:**
- Create: `apps/npm-burst/src/app/hooks/use-health-data.ts`

**Step 1: Write the hook**

```typescript
// apps/npm-burst/src/app/hooks/use-health-data.ts
import { useEffect, useState } from 'react';
import {
  onGetHealthData,
  type HealthData,
} from '../../server/functions/health.telefunc';
import { onResolvePackageRepo } from '../../server/functions/repo.telefunc';

export function useHealthData(packageName: string) {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!packageName) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        // Ensure repo is resolved/linked first
        await onResolvePackageRepo(packageName);
        const result = await onGetHealthData(packageName);
        if (!cancelled) setData(result);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load health data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [packageName]);

  return { data, loading, error };
}
```

**Step 2: Commit**

```bash
git add apps/npm-burst/src/app/hooks/use-health-data.ts
git commit -m "feat: add useHealthData hook for health view"
```

---

## Task 20: Health View in Package Dashboard

**Files:**
- Create: `apps/npm-burst/src/app/components/health-view.tsx`
- Modify: `apps/npm-burst/src/app/package-dashboard.tsx`

**Step 1: Create the health view wrapper**

```typescript
// apps/npm-burst/src/app/components/health-view.tsx
import { memo } from 'react';
import { ExternalLink } from 'lucide-react';
import { useAppStore } from '../store';
import { useHealthData } from '../hooks/use-health-data';
import { HealthAccordion } from './health-accordion';
import { LoadingSkeleton } from './loading-skeleton';
import { ErrorMessage } from './error-message';

export const HealthView = memo(function HealthView() {
  const npmPackageName = useAppStore((s) => s.npmPackageName);
  const { data, loading, error } = useHealthData(npmPackageName);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorMessage message={error} />;
  if (!data) return null;

  return (
    <div>
      {data.repo && (
        <p style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>
          Repository:{' '}
          <a
            href={`https://github.com/${data.repo.owner}/${data.repo.name}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {data.repo.owner}/{data.repo.name}
            <ExternalLink size={12} style={{ marginLeft: 4 }} />
          </a>
        </p>
      )}
      <HealthAccordion snapshots={data.snapshots} />
    </div>
  );
});
```

**Step 2: Add health view to the package dashboard**

In `apps/npm-burst/src/app/package-dashboard.tsx`, add the import and the view mode branch.

Add import at top:
```typescript
import { HealthView } from './components/health-view';
```

In the view mode conditional (around line 160-172), add before the final `null`:
```typescript
) : viewMode === 'health' ? (
  <HealthView />
) : null}
```

**Step 3: Commit**

```bash
git add apps/npm-burst/src/app/components/health-view.tsx apps/npm-burst/src/app/package-dashboard.tsx
git commit -m "feat: integrate health view into package dashboard"
```

---

## Task 21: Usage Page — Health Summary

**Files:**
- Modify: `apps/npm-burst/src/app/usage-page.tsx`

**Step 1: Add health summary to tracked packages table**

Add a "Repo Health" column to the tracked packages table. For each package, show a small health indicator (e.g., issue open/close ratio or just "N/A" if no health data exists).

This requires a new telefunc that batch-fetches health summaries for all tracked packages. Create:

```typescript
// apps/npm-burst/src/server/functions/health.telefunc.ts (add to existing file)

export interface PackageHealthSummary {
  packageName: string;
  repo: { owner: string; name: string } | null;
  latestMetrics: HealthMetricSnapshot | null;
}

export async function onGetTrackedPackagesHealth(
  packageNames: string[]
): Promise<PackageHealthSummary[]> {
  const { env } = getContext();
  if (isDevMode(env)) return packageNames.map((p) => ({ packageName: p, repo: null, latestMetrics: null }));

  const db = getDb(env);
  const results: PackageHealthSummary[] = [];

  for (const pkg of packageNames) {
    const data = await onGetHealthData(pkg);
    results.push({
      packageName: pkg,
      repo: data.repo,
      latestMetrics: data.snapshots.length > 0 ? data.snapshots[data.snapshots.length - 1] : null,
    });
  }

  return results;
}
```

Then in `usage-page.tsx`, after loading usage data, also fetch health summaries and display in a new column or section below the tracked packages table.

**Step 2: Commit**

```bash
git add apps/npm-burst/src/server/functions/health.telefunc.ts apps/npm-burst/src/app/usage-page.tsx
git commit -m "feat: show health summary on usage page for tracked packages"
```

---

## Task 22: GitHub App Webhook Handler (Installation Events)

**Files:**
- Create: `apps/npm-burst/src/server/functions/github-webhook.telefunc.ts`

> **Note:** This can also be a Vike API route instead of telefunc, since GitHub webhooks are server-to-server. The exact approach depends on Vike's API route support. For now, create a server function.

**Step 1: Write the webhook handler**

This handles the `installation` event from GitHub when an org installs/uninstalls the app.

```typescript
// apps/npm-burst/src/server/functions/github-webhook.ts
// (This is a regular server function, not a telefunc, since it's called by GitHub)
import type { Env } from '../env';
import { getDb } from '../db';

interface InstallationEvent {
  action: 'created' | 'deleted';
  installation: {
    id: number;
    account: {
      login: string;
      type: 'Organization' | 'User';
    };
  };
}

export async function handleInstallationWebhook(
  event: InstallationEvent,
  env: Env
): Promise<void> {
  const db = getDb(env);

  if (event.action === 'created') {
    await db
      .insertInto('github_installations')
      .values({
        installation_id: event.installation.id,
        owner: event.installation.account.login,
        owner_type: event.installation.account.type,
      })
      .onConflict((oc) =>
        oc.column('installation_id').doUpdateSet({
          owner: event.installation.account.login,
          owner_type: event.installation.account.type,
          updated_at: new Date().toISOString(),
        })
      )
      .execute();

    // Link existing repos for this owner
    await db
      .updateTable('github_repos')
      .set({
        installation_id: db
          .selectFrom('github_installations')
          .select('id')
          .where('installation_id', '=', event.installation.id),
      })
      .where('owner', '=', event.installation.account.login)
      .where('installation_id', 'is', null)
      .execute();
  } else if (event.action === 'deleted') {
    // Null out installation reference on repos
    const installation = await db
      .selectFrom('github_installations')
      .select('id')
      .where('installation_id', '=', event.installation.id)
      .executeTakeFirst();

    if (installation) {
      await db
        .updateTable('github_repos')
        .set({ installation_id: null })
        .where('installation_id', '=', installation.id)
        .execute();

      await db
        .deleteFrom('github_installations')
        .where('id', '=', installation.id)
        .execute();
    }
  }
}
```

**Step 2: Commit**

```bash
git add apps/npm-burst/src/server/functions/github-webhook.ts
git commit -m "feat: add GitHub App installation webhook handler"
```

---

## Task 23: Verify End-to-End

**Step 1: Run all tests**

Run: `npx nx run-many --target=test --all`
Expected: All tests pass.

**Step 2: Run linting**

Run: `npx nx run-many --target=lint --all`
Expected: No lint errors.

**Step 3: Run the build**

Run: `npx nx run-many --target=build --all`
Expected: Build succeeds.

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: resolve build and lint issues from health report feature"
```

---

## Summary

| Task | Component | Files |
|------|-----------|-------|
| 1 | Database Migration | 1 migration + 2 schema files |
| 2 | Encryption Utility | crypto.ts + tests |
| 3 | JWT Generation | github-jwt.ts + tests |
| 4 | Auth Service | github-auth.ts + tests |
| 5 | Bot Filter | bot-filter.ts + tests |
| 6 | GraphQL Client | github-graphql.ts + types.ts |
| 7 | Metrics Computation | compute-metrics.ts + tests |
| 8 | Repo Resolution | resolve-repo.ts + tests |
| 9 | Library Exports | index.ts |
| 10 | Cron Job | env.ts + github-health-cron.ts + cron.ts |
| 11 | Health Telefunc | health.telefunc.ts |
| 12 | Repo Telefunc | repo.telefunc.ts |
| 13 | Main App Env | env.ts |
| 14 | Store Update | app-store.ts |
| 15 | Header Update | dashboard-header.tsx |
| 16 | Sparkline | sparkline.tsx |
| 17 | Health Accordion | health-accordion.tsx + scss |
| 18 | Metric Chart | health-metric-chart.tsx |
| 19 | Health Hook | use-health-data.ts |
| 20 | Dashboard Integration | health-view.tsx + package-dashboard.tsx |
| 21 | Usage Page | usage-page.tsx + health.telefunc.ts |
| 22 | Webhook Handler | github-webhook.ts |
| 23 | E2E Verification | All files |
