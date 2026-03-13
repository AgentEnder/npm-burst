import type { Kysely } from 'kysely';
import type { DB } from './db-schema';

export const DEFAULT_MAX_TRACKED_PACKAGES = 5;
export const WEEKLY_DOWNLOAD_THRESHOLD = 500_000;

export async function getUserQuota(
  db: Kysely<DB>,
  userId: string
): Promise<number> {
  const row = await db
    .selectFrom('user_quotas')
    .select('max_tracked_packages')
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return row?.max_tracked_packages ?? DEFAULT_MAX_TRACKED_PACKAGES;
}
