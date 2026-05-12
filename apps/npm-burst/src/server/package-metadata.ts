import { parseGitHubRepositoryUrl } from '@npm-burst/github-data-access';
import type { Kysely } from 'kysely';
import type { DB } from './db-schema';
import { cachedFetch } from './npm-fetch';

export interface PackageMaintainerRecord {
  name: string;
  email: string;
}

export interface StoredPackageMetadata {
  maintainers: PackageMaintainerRecord[];
  githubRepo: {
    owner: string;
    name: string;
  } | null;
  metadataRefreshedAt: string | null;
}

function isSameDay(timestamp: string | null): boolean {
  return (
    !!timestamp &&
    timestamp.slice(0, 10) === new Date().toISOString().slice(0, 10)
  );
}

function parseMaintainers(value: string | null): PackageMaintainerRecord[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const name =
        'name' in entry && typeof entry.name === 'string' ? entry.name : null;
      const email =
        'email' in entry && typeof entry.email === 'string'
          ? entry.email
          : null;
      return name && email ? [{ name, email }] : [];
    });
  } catch {
    return [];
  }
}

export function parseStoredPackageMetadataRow(row: {
  maintainers_json: string | null;
  github_owner: string | null;
  github_repo_name: string | null;
  metadata_refreshed_at: string | null;
}): StoredPackageMetadata {
  return {
    maintainers: parseMaintainers(row.maintainers_json),
    githubRepo:
      row.github_owner && row.github_repo_name
        ? { owner: row.github_owner, name: row.github_repo_name }
        : null,
    metadataRefreshedAt: row.metadata_refreshed_at,
  };
}

export async function fetchPackageMetadataFromRegistry(
  db: Kysely<DB>,
  packageName: string
): Promise<StoredPackageMetadata> {
  const body = await cachedFetch(
    db,
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}`
  );

  try {
    const parsed = JSON.parse(body) as {
      maintainers?: PackageMaintainerRecord[];
      repository?: unknown;
    };
    const githubRepo = parseGitHubRepositoryUrl(parsed.repository);

    return {
      maintainers: parsed.maintainers ?? [],
      githubRepo,
      metadataRefreshedAt: new Date().toISOString(),
    };
  } catch {
    return {
      maintainers: [],
      githubRepo: null,
      metadataRefreshedAt: new Date().toISOString(),
    };
  }
}

export async function getStoredPackageMetadata(
  db: Kysely<DB>,
  packageName: string
): Promise<StoredPackageMetadata | null> {
  const row = await db
    .selectFrom('tracked_packages')
    .select([
      'maintainers_json',
      'github_owner',
      'github_repo_name',
      'metadata_refreshed_at',
    ])
    .where('package_name', '=', packageName)
    .executeTakeFirst();

  return row ? parseStoredPackageMetadataRow(row) : null;
}

export async function syncTrackedPackageMetadata(
  db: Kysely<DB>,
  packageName: string
): Promise<StoredPackageMetadata> {
  const metadata = await fetchPackageMetadataFromRegistry(db, packageName);

  await db
    .updateTable('tracked_packages')
    .set({
      maintainers_json: JSON.stringify(metadata.maintainers),
      github_owner: metadata.githubRepo?.owner ?? null,
      github_repo_name: metadata.githubRepo?.name ?? null,
      metadata_refreshed_at: metadata.metadataRefreshedAt,
    })
    .where('package_name', '=', packageName)
    .execute();

  return metadata;
}

export async function ensureTrackedPackageMetadata(
  db: Kysely<DB>,
  packageName: string
): Promise<StoredPackageMetadata> {
  const existing = await getStoredPackageMetadata(db, packageName);
  if (existing && isSameDay(existing.metadataRefreshedAt)) {
    return existing;
  }
  return syncTrackedPackageMetadata(db, packageName);
}
