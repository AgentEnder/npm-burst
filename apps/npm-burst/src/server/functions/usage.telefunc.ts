import { Abort, getContext } from 'telefunc';
import { getDb } from '../db';
import { isDevMode } from '../env';
import { getUserEmails } from '../clerk-utils';
import { getPackageMaintainers, isUserMaintainer } from '../npm-maintainers';
import type { NpmMaintainer } from '../npm-maintainers';
import { getPackageWeeklyDownloads } from '../npm-downloads';
import { MAX_TRACKED_PACKAGES, WEEKLY_DOWNLOAD_THRESHOLD } from '../constants';

export interface TrackedPackageInfo {
  packageName: string;
  weeklyDownloads: number;
  isLargePackage: boolean;
  isMaintainer: boolean;
  maintainers: NpmMaintainer[];
  countsAgainstQuota: boolean;
}

export interface UsageInfo {
  trackedPackages: TrackedPackageInfo[];
  quotaUsed: number;
  quotaLimit: number;
  downloadThreshold: number;
  userEmails: string[];
}

export async function onGetUsageInfo(): Promise<UsageInfo> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  if (isDevMode(env)) {
    return {
      trackedPackages: [],
      quotaUsed: 0,
      quotaLimit: MAX_TRACKED_PACKAGES,
      downloadThreshold: WEEKLY_DOWNLOAD_THRESHOLD,
      userEmails: ['dev@example.com'],
    };
  }

  const db = getDb(env);
  const userEmails = await getUserEmails(userId, env);

  const trackedPkgs = await db
    .selectFrom('tracked_packages as tp')
    .innerJoin('user_tracked_packages as utp', 'tp.id', 'utp.package_id')
    .select('tp.package_name')
    .where('utp.user_id', '=', userId)
    .orderBy('tp.package_name')
    .execute();

  const trackedPackages: TrackedPackageInfo[] = [];
  let quotaUsed = 0;

  for (const row of trackedPkgs) {
    const weeklyDownloads = await getPackageWeeklyDownloads(db, row.package_name);
    const isLargePackage = weeklyDownloads >= WEEKLY_DOWNLOAD_THRESHOLD;
    const maintainers = await getPackageMaintainers(db, row.package_name);
    const isMaintainer = isUserMaintainer(userEmails, maintainers);
    const countsAgainstQuota = !isLargePackage && !isMaintainer;

    if (countsAgainstQuota) {
      quotaUsed++;
    }

    trackedPackages.push({
      packageName: row.package_name,
      weeklyDownloads,
      isLargePackage,
      isMaintainer,
      maintainers,
      countsAgainstQuota,
    });
  }

  return {
    trackedPackages,
    quotaUsed,
    quotaLimit: MAX_TRACKED_PACKAGES,
    downloadThreshold: WEEKLY_DOWNLOAD_THRESHOLD,
    userEmails,
  };
}
