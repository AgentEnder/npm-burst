import { getContext } from 'telefunc';
import { getDb } from '../db';
import { isDevMode } from '../env';
import { getFixtureSnapshots } from '../fixtures/packages';
import { getSnapshots, type Snapshot } from '../snapshots';

export type { Snapshot };

export async function onGetSnapshots(
  pkg: string
): Promise<{ snapshots: Snapshot[] }> {
  const { env } = getContext();

  if (isDevMode(env)) {
    return { snapshots: getFixtureSnapshots(pkg) };
  }

  return { snapshots: await getSnapshots(getDb(env), pkg) };
}
