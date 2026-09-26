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

export interface SnapshotPage {
  /** Oldest first, matching the order the store keeps history in. */
  snapshots: Snapshot[];
  /** Whether snapshots older than this page exist. */
  hasMore: boolean;
}

export const SNAPSHOT_PAGE_SIZE = 25;
const MAX_SNAPSHOT_PAGE_SIZE = 100;

/**
 * One page of snapshot history, walking from newest to oldest.
 *
 * Loaded in the background by the client after the shell has painted — never
 * on the SSR critical path. Paging newest-first means the most useful history
 * (the recent past) lands first, and the client can stop early once it reaches
 * snapshots it already holds in its local cache.
 *
 * @param before only return snapshots strictly older than this date
 */
export async function getSnapshotPage(
  db: Kysely<DB>,
  pkg: string,
  options: { before?: string; limit?: number } = {}
): Promise<SnapshotPage> {
  const packageId = await getTrackedPackageId(db, pkg);
  if (packageId === null) return { snapshots: [], hasMore: false };

  const limit = clampPageSize(options.limit);

  let query = db
    .selectFrom('snapshots')
    .select(['snapshot_date', 'downloads'])
    .where('package_id', '=', packageId);
  if (options.before) {
    query = query.where('snapshot_date', '<', options.before);
  }

  // Fetch one extra row to learn whether another page exists without a count.
  const rows = await query
    .orderBy('snapshot_date', 'desc')
    .limit(limit + 1)
    .execute();

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();

  return { snapshots: await Promise.all(page.map(toSnapshot)), hasMore };
}

/**
 * Pages an in-memory, oldest-first snapshot list the same way
 * {@link getSnapshotPage} pages the database. Used for dev fixtures.
 */
export function pageSnapshots(
  all: Snapshot[],
  options: { before?: string; limit?: number } = {}
): SnapshotPage {
  const limit = clampPageSize(options.limit);
  const eligible = options.before
    ? all.filter((s) => s.date < options.before!)
    : all;
  return {
    snapshots: eligible.slice(-limit),
    hasMore: eligible.length > limit,
  };
}

function clampPageSize(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return SNAPSHOT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_SNAPSHOT_PAGE_SIZE, Math.floor(limit)));
}

export interface TrackedPackageSummary {
  packageName: string;
  /** Newest snapshot date, or null if tracked but never snapshotted yet. */
  lastSnapshotDate: string | null;
}

/**
 * Every package we hold snapshots for, newest tracked first.
 *
 * Feeds the sitemap (all of them) and the landing page (a slice). Deliberately
 * does *not* touch the `downloads` blob — that column is compressed JSON and
 * decompressing one per package would make both callers far more expensive
 * than they need to be. `max(snapshot_date)` gives the sitemap a `lastmod`
 * without reading any payload.
 */
export async function listTrackedPackages(
  db: Kysely<DB>,
  limit?: number
): Promise<TrackedPackageSummary[]> {
  let query = db
    .selectFrom('tracked_packages as tp')
    .leftJoin('snapshots as s', 's.package_id', 'tp.id')
    .select(({ fn }) => [
      'tp.package_name as packageName',
      fn.max('s.snapshot_date').as('lastSnapshotDate'),
    ])
    .groupBy('tp.package_name')
    .orderBy('tp.created_at', 'desc');

  if (limit !== undefined) query = query.limit(limit);

  const rows = await query.execute();

  return rows.map((row) => ({
    packageName: row.packageName,
    lastSnapshotDate: row.lastSnapshotDate ?? null,
  }));
}

/** Whether the package is known to us at all — drives 404 vs empty state. */
export async function isPackageTracked(
  db: Kysely<DB>,
  pkg: string
): Promise<boolean> {
  return (await getTrackedPackageId(db, pkg)) !== null;
}
