import type { Kysely } from 'kysely';
import type { DB } from './db-schema';
import {
  ensureTrackedPackageMetadata,
  fetchPackageMetadataFromRegistry,
} from './package-metadata';

export interface NpmMaintainer {
  name: string;
  email: string;
}

export async function getPackageMaintainers(
  db: Kysely<DB>,
  pkg: string
): Promise<NpmMaintainer[]> {
  const existing = await db
    .selectFrom('tracked_packages')
    .select('id')
    .where('package_name', '=', pkg)
    .executeTakeFirst();

  if (existing) {
    return ensureTrackedPackageMetadata(db, pkg).then((metadata) => metadata.maintainers);
  }

  return fetchPackageMetadataFromRegistry(db, pkg).then((metadata) => metadata.maintainers);
}

export function isUserMaintainer(
  userEmails: string[],
  maintainers: NpmMaintainer[]
): boolean {
  const maintainerEmailSet = new Set(
    maintainers.map((m) => m.email.toLowerCase())
  );
  return userEmails.some((email) =>
    maintainerEmailSet.has(email.toLowerCase())
  );
}
