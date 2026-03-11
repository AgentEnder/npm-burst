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
    await db.execute({
      sql: 'INSERT OR IGNORE INTO tracked_packages (package_name) VALUES (?)',
      args: [pkg],
    });

    const pkgRow = await db.execute({
      sql: 'SELECT id FROM tracked_packages WHERE package_name = ?',
      args: [pkg],
    });

    if (pkgRow.rows.length > 0) {
      const packageId = pkgRow.rows[0].id as number;

      // Only insert if snapshot doesn't exist for yesterday
      await db.execute({
        sql: `INSERT OR IGNORE INTO snapshots (package_id, snapshot_date, downloads)
              VALUES (?, ?, ?)`,
        args: [packageId, yesterday, JSON.stringify(data.downloads)],
      });
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
