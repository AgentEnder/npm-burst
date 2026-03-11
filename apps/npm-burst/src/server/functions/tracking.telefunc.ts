import { getContext, Abort } from 'telefunc';
import { getDb } from '../db';

export async function onTrackPackage(pkg: string): Promise<{ success: boolean }> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  const db = getDb(env);

  // Ensure package exists
  await db.execute({
    sql: 'INSERT OR IGNORE INTO tracked_packages (package_name) VALUES (?)',
    args: [pkg],
  });

  const pkgRow = await db.execute({
    sql: 'SELECT id FROM tracked_packages WHERE package_name = ?',
    args: [pkg],
  });

  const packageId = pkgRow.rows[0].id as number;

  // Link user to package
  await db.execute({
    sql: 'INSERT OR IGNORE INTO user_tracked_packages (user_id, package_id) VALUES (?, ?)',
    args: [userId, packageId],
  });

  return { success: true };
}

export async function onUntrackPackage(pkg: string): Promise<{ success: boolean }> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  const db = getDb(env);

  const pkgRow = await db.execute({
    sql: 'SELECT id FROM tracked_packages WHERE package_name = ?',
    args: [pkg],
  });

  if (pkgRow.rows.length > 0) {
    const packageId = pkgRow.rows[0].id as number;
    await db.execute({
      sql: 'DELETE FROM user_tracked_packages WHERE user_id = ? AND package_id = ?',
      args: [userId, packageId],
    });
  }

  return { success: true };
}

export async function onGetTrackedPackages(): Promise<{ packages: string[] }> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  const db = getDb(env);

  const result = await db.execute({
    sql: `SELECT tp.package_name
          FROM tracked_packages tp
          JOIN user_tracked_packages utp ON tp.id = utp.package_id
          WHERE utp.user_id = ?
          ORDER BY tp.package_name`,
    args: [userId],
  });

  return {
    packages: result.rows.map((r) => r.package_name as string),
  };
}

export async function onIsPackageTracked(pkg: string): Promise<{ tracked: boolean }> {
  const { env, userId } = getContext();

  if (!userId) {
    return { tracked: false };
  }

  const db = getDb(env);

  const result = await db.execute({
    sql: `SELECT 1
          FROM tracked_packages tp
          JOIN user_tracked_packages utp ON tp.id = utp.package_id
          WHERE utp.user_id = ? AND tp.package_name = ?`,
    args: [userId, pkg],
  });

  return { tracked: result.rows.length > 0 };
}
