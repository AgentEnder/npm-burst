import { getContext } from 'telefunc';
import { getDb } from '../db';
import { isDevMode } from '../env';
import { getFixtureSnapshots } from '../fixtures/packages';
import {
  getSnapshotPage,
  pageSnapshots,
  type Snapshot,
  type SnapshotPage,
} from '../snapshots';

export type { Snapshot, SnapshotPage };

/**
 * One page of a package's snapshot history, newest first. Pass the oldest
 * date already received as `before` to fetch the next (older) page.
 */
export async function onGetSnapshots(
  pkg: string,
  options: { before?: string; limit?: number } = {}
): Promise<SnapshotPage> {
  const { env } = getContext();

  if (isDevMode(env)) {
    return pageSnapshots(getFixtureSnapshots(pkg), options);
  }

  return getSnapshotPage(getDb(env), pkg, options);
}
