import { getDb } from './db';

interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
}

export async function handleCron(env: Env): Promise<void> {
  const db = getDb(env);
  const yesterday = getYesterdayDate();

  // Get all tracked packages (those with at least one user tracking them)
  const result = await db.execute({
    sql: `SELECT DISTINCT tp.id, tp.package_name
          FROM tracked_packages tp
          JOIN user_tracked_packages utp ON tp.id = utp.package_id`,
    args: [],
  });

  for (const row of result.rows) {
    const packageId = row.id as number;
    const packageName = row.package_name as string;

    // Check if we already have a snapshot for yesterday
    const existing = await db.execute({
      sql: 'SELECT 1 FROM snapshots WHERE package_id = ? AND snapshot_date = ?',
      args: [packageId, yesterday],
    });

    if (existing.rows.length > 0) {
      continue; // Already have this snapshot (e.g., from ad-hoc)
    }

    try {
      const response = await fetch(
        `https://api.npmjs.org/versions/${encodeURI(packageName).replace('/', '%2f')}/last-week`
      );
      const data = (await response.json()) as {
        downloads: Record<string, number>;
      };

      await db.execute({
        sql: `INSERT OR IGNORE INTO snapshots (package_id, snapshot_date, downloads)
              VALUES (?, ?, ?)`,
        args: [packageId, yesterday, JSON.stringify(data.downloads)],
      });
    } catch (e) {
      console.error(`Failed to fetch snapshot for ${packageName}:`, e);
    }
  }
}

function getYesterdayDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}
