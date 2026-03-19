import { getContext } from 'telefunc';
import { decompressJson } from '@npm-burst/shared';
import { getDb } from '../db';
import { isDevMode } from '../env';
import { getFixtureSnapshots } from '../fixtures/packages';

export interface Snapshot {
  date: string;
  downloads: Record<string, number>;
}

export async function onGetSnapshots(
  pkg: string
): Promise<{ snapshots: Snapshot[] }> {
  const { env } = getContext();

  // In dev mode, return fixture snapshots
  if (isDevMode(env)) {
    return { snapshots: getFixtureSnapshots(pkg) };
  }

  const db = getDb(env);

  const pkgRow = await db
    .selectFrom('tracked_packages')
    .select('id')
    .where('package_name', '=', pkg)
    .executeTakeFirst();

  if (!pkgRow) {
    return { snapshots: [] };
  }

  const result = await db
    .selectFrom('snapshots')
    .select(['snapshot_date', 'downloads'])
    .where('package_id', '=', pkgRow.id)
    .orderBy('snapshot_date', 'asc')
    .execute();

  return {
    snapshots: await Promise.all(
      result.map(async (r) => ({
        date: r.snapshot_date,
        downloads: (await decompressJson<Record<string, number>>(
          r.downloads
        )) as Record<string, number>,
      }))
    ),
  };
}
