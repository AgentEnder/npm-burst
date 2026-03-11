import { getContext, Abort } from 'telefunc';
import { getDb } from '../db';

interface NpmDownloadsByVersion {
  downloads: Record<string, number>;
  package: string;
}

export async function onGetDownloads(pkg: string): Promise<NpmDownloadsByVersion> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  // Fetch from NPM API
  const response = await fetch(
    `https://api.npmjs.org/versions/${encodeURI(pkg).replace('/', '%2f')}/last-week`
  );
  const data = (await response.json()) as NpmDownloadsByVersion;

  // Opportunistically save snapshot for yesterday
  const yesterday = getYesterdayDate();
  const db = getDb(env);

  try {
    // Ensure package exists in tracked_packages (for ad-hoc snapshots)
    await db
      .insertInto('tracked_packages')
      .values({ package_name: pkg })
      .onConflict((oc) => oc.column('package_name').doNothing())
      .execute();

    const pkgRow = await db
      .selectFrom('tracked_packages')
      .select('id')
      .where('package_name', '=', pkg)
      .executeTakeFirst();

    if (pkgRow) {
      // Only insert if snapshot doesn't exist for yesterday
      await db
        .insertInto('snapshots')
        .values({
          package_id: pkgRow.id,
          snapshot_date: yesterday,
          downloads: JSON.stringify(data.downloads),
        })
        .onConflict((oc) =>
          oc.columns(['package_id', 'snapshot_date']).doNothing()
        )
        .execute();
    }
  } catch (e) {
    // Don't fail the request if snapshot saving fails
    console.error('Failed to save ad-hoc snapshot:', e);
  }

  return data;
}

function getYesterdayDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}
