import { Abort, getContext } from 'telefunc';
import { getDb } from '../db';
import { isDevMode } from '../env';
import { getUserEmails } from '../clerk-utils';
import { getPackageMaintainers, isUserMaintainer } from '../npm-maintainers';
import type { NpmMaintainer } from '../npm-maintainers';
import { getPackageWeeklyDownloads } from '../npm-downloads';
import { MAX_TRACKED_PACKAGES, WEEKLY_DOWNLOAD_THRESHOLD } from '../constants';
import { getFixturePackage, getAllFixturePackageNames } from '../fixtures/packages';

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
    const devMaintainers: NpmMaintainer[] = [
      { name: 'jdoe', email: 'jdoe@example.com' },
      { name: 'dev-user', email: 'dev@example.com' },
    ];
    const devPackages: TrackedPackageInfo[] = getAllFixturePackageNames().map(
      (name) => {
        const fixture = getFixturePackage(name);
        const weeklyDownloads = fixture
          ? Object.values(fixture.downloads).reduce((s, n) => s + n, 0)
          : 0;
        const isLargePackage = weeklyDownloads >= WEEKLY_DOWNLOAD_THRESHOLD;
        // Simulate: dev user maintains 'nx' but not the others
        const isMaintainer = name === 'nx';
        const countsAgainstQuota = !isLargePackage && !isMaintainer;
        return {
          packageName: name,
          weeklyDownloads,
          isLargePackage,
          isMaintainer,
          maintainers: isMaintainer ? devMaintainers : [devMaintainers[0]],
          countsAgainstQuota,
        };
      }
    );
    return {
      trackedPackages: devPackages,
      quotaUsed: devPackages.filter((p) => p.countsAgainstQuota).length,
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

  const trackedPackages: TrackedPackageInfo[] = await Promise.all(
    trackedPkgs.map(async (row) => {
      const [weeklyDownloads, maintainers] = await Promise.all([
        getPackageWeeklyDownloads(db, row.package_name),
        getPackageMaintainers(db, row.package_name),
      ]);
      const isLargePackage = weeklyDownloads >= WEEKLY_DOWNLOAD_THRESHOLD;
      const isMaintainer = isUserMaintainer(userEmails, maintainers);
      const countsAgainstQuota = !isLargePackage && !isMaintainer;
      return {
        packageName: row.package_name,
        weeklyDownloads,
        isLargePackage,
        isMaintainer,
        maintainers,
        countsAgainstQuota,
      };
    })
  );
  const quotaUsed = trackedPackages.filter((p) => p.countsAgainstQuota).length;

  return {
    trackedPackages,
    quotaUsed,
    quotaLimit: MAX_TRACKED_PACKAGES,
    downloadThreshold: WEEKLY_DOWNLOAD_THRESHOLD,
    userEmails,
  };
}
