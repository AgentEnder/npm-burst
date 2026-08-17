import type { Kysely } from 'kysely';
import { decompressJson } from '@npm-burst/shared';
import type { DB } from './db-schema';

export interface Snapshot {
  date: string;
  downloads: Record<string, number>;
}

async function toSnapshot(row: {
  snapshot_date: string;
  downloads: Uint8Array | string;
}): Promise<Snapshot> {
  return {
    date: row.snapshot_date,
    downloads: (await decompressJson<Record<string, number>>(
      row.downloads
    )) as Record<string, number>,
  };
}

async function getTrackedPackageId(
  db: Kysely<DB>,
  pkg: string
): Promise<number | null> {
  const row = await db
    .selectFrom('tracked_packages')
    .select('id')
    .where('package_name', '=', pkg)
    .$narrowType<{ id: number }>()
    .executeTakeFirst();
  return row?.id ?? null;
}

/**
 * The newest snapshot only.
 *
 * The sunburst renders from a single snapshot, so this is all the server needs
 * to block on for a meaningful first paint. Loading the full history instead
 * would inline every snapshot into the SSR'd HTML — and, since that HTML is
 * edge-cached per package, bloat the cached artifact for no first-paint gain.
 */
export async function getLatestSnapshot(
  db: Kysely<DB>,
  pkg: string
): Promise<Snapshot | null> {
  const packageId = await getTrackedPackageId(db, pkg);
  if (packageId === null) return null;

  const row = await db
    .selectFrom('snapshots')
    .select(['snapshot_date', 'downloads'])
    .where('package_id', '=', packageId)
    .orderBy('snapshot_date', 'desc')
    .limit(1)
    .executeTakeFirst();

  return row ? toSnapshot(row) : null;
}

/**
 * The full snapshot history. Loaded in the background by the client after the
 * shell has painted — never on the SSR critical path.
 */
export async function getSnapshots(
  db: Kysely<DB>,
  pkg: string
): Promise<Snapshot[]> {
  const packageId = await getTrackedPackageId(db, pkg);
  if (packageId === null) return [];

  const rows = await db
    .selectFrom('snapshots')
    .select(['snapshot_date', 'downloads'])
    .where('package_id', '=', packageId)
    .orderBy('snapshot_date', 'asc')
    .execute();

  return Promise.all(rows.map(toSnapshot));
}

/** Whether the package is known to us at all — drives 404 vs empty state. */
export async function isPackageTracked(
  db: Kysely<DB>,
  pkg: string
): Promise<boolean> {
  return (await getTrackedPackageId(db, pkg)) !== null;
}
