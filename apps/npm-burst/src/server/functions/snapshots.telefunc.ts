import { getContext } from 'telefunc';
import { getDb } from '../db';

export interface Snapshot {
  date: string;
  downloads: Record<string, number>;
}

export async function onGetSnapshots(pkg: string): Promise<{ snapshots: Snapshot[] }> {
  const { env } = getContext();
  const db = getDb(env);

  const pkgRow = await db.execute({
    sql: 'SELECT id FROM tracked_packages WHERE package_name = ?',
    args: [pkg],
  });

  if (pkgRow.rows.length === 0) {
    return { snapshots: [] };
  }

  const packageId = pkgRow.rows[0].id as number;

  const result = await db.execute({
    sql: `SELECT snapshot_date, downloads
          FROM snapshots
          WHERE package_id = ?
          ORDER BY snapshot_date ASC`,
    args: [packageId],
  });

  return {
    snapshots: result.rows.map((r) => ({
      date: r.snapshot_date as string,
      downloads: JSON.parse(r.downloads as string),
    })),
  };
}
