import { getDb } from './db';
import type { Env } from './env';
import { cachedFetch } from './npm-fetch';
import { getYesterdayDate } from './utils';

export async function handleCron(env: Env): Promise<void> {
  const db = getDb(env);
  const yesterday = getYesterdayDate();

  // Get all tracked packages (those with at least one user tracking them)
  const result = await db
    .selectFrom('tracked_packages as tp')
    .innerJoin('user_tracked_packages as utp', 'tp.id', 'utp.package_id')
    .select(['tp.id', 'tp.package_name'])
    .$narrowType<{ id: number; package_name: string }>()
    .distinct()
    .execute();

  for (const row of result) {
    const packageId = row.id;
    const packageName = row.package_name;

    // Check if we already have a snapshot for yesterday
    const existing = await db
      .selectFrom('snapshots')
      .select('id')
      .where('package_id', '=', packageId)
      .where('snapshot_date', '=', yesterday)
      .$narrowType<{ id: number }>()
      .executeTakeFirst();

    if (existing) {
      continue;
    }

    try {
      const url = `https://api.npmjs.org/versions/${encodeURI(
        packageName
      ).replace('/', '%2f')}/last-week`;
      const body = await cachedFetch(db, url);
      const data = JSON.parse(body) as {
        downloads: Record<string, number>;
      };

      await db
        .insertInto('snapshots')
        .values({
          package_id: packageId,
          snapshot_date: yesterday,
          downloads: JSON.stringify(data.downloads),
        })
        .onConflict((oc) =>
          oc.columns(['package_id', 'snapshot_date']).doNothing()
        )
        .execute();
    } catch (e) {
      console.error(`Failed to fetch snapshot for ${packageName}:`, e);
    }
  }
}
