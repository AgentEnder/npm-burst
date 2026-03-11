import { getDb } from './db';
import type { Env } from './env';
import { getYesterdayDate } from './utils';

export async function handleCron(env: Env): Promise<void> {
  const db = getDb(env);
  const yesterday = getYesterdayDate();

  // Get all tracked packages (those with at least one user tracking them)
  const result = await db
    .selectFrom('tracked_packages as tp')
    .innerJoin('user_tracked_packages as utp', 'tp.id', 'utp.package_id')
    .select(['tp.id', 'tp.package_name'])
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
      .executeTakeFirst();

    if (existing) {
      continue; // Already have this snapshot (e.g., from ad-hoc)
    }

    try {
      const response = await fetch(
        `https://api.npmjs.org/versions/${encodeURI(packageName).replace('/', '%2f')}/last-week`
      );
      const data = (await response.json()) as {
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
