import { Abort, getContext } from 'telefunc';
import { getDb } from '../db';
import { isDevMode } from '../env';
import { getAllFixturePackageNames } from '../fixtures/packages';
import { getUserEmails } from '../clerk-utils';
import { getPackageMaintainers, isUserMaintainer } from '../npm-maintainers';
import { getPackageWeeklyDownloads } from '../npm-downloads';
import { DEFAULT_MAX_TRACKED_PACKAGES, WEEKLY_DOWNLOAD_THRESHOLD, getUserQuota } from '../constants';

// In-memory tracked packages for dev mode (no DB required)
const devTrackedPackages = new Set<string>(getAllFixturePackageNames());

export async function onTrackPackage(
  pkg: string
): Promise<{ success: boolean }> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  if (isDevMode(env)) {
    devTrackedPackages.add(pkg);
    return { success: true };
  }

  const db = getDb(env);

  // --- Quota check ---
  const weeklyDownloads = await getPackageWeeklyDownloads(db, pkg);
  const isLargePackage = weeklyDownloads >= WEEKLY_DOWNLOAD_THRESHOLD;

  if (!isLargePackage) {
    const userEmails = await getUserEmails(userId, env);
    const maintainers = await getPackageMaintainers(db, pkg);
    const isMaintainer = isUserMaintainer(userEmails, maintainers);

    if (!isMaintainer) {
      // Count existing tracked packages that count against quota
      const trackedPkgs = await db
        .selectFrom('tracked_packages as tp')
        .innerJoin('user_tracked_packages as utp', 'tp.id', 'utp.package_id')
        .select('tp.package_name')
        .where('utp.user_id', '=', userId)
        .execute();

      const quotaResults = await Promise.all(
        trackedPkgs.map(async (row) => {
          const [dl, maint] = await Promise.all([
            getPackageWeeklyDownloads(db, row.package_name),
            getPackageMaintainers(db, row.package_name),
          ]);
          if (dl >= WEEKLY_DOWNLOAD_THRESHOLD) return false;
          if (isUserMaintainer(userEmails, maint)) return false;
          return true;
        })
      );
      const quotaCount = quotaResults.filter(Boolean).length;
      const maxPackages = await getUserQuota(db, userId);

      if (quotaCount >= maxPackages) {
        throw Abort({
          reason: 'QUOTA_EXCEEDED',
          message: `You can track up to ${maxPackages} packages with under ${(WEEKLY_DOWNLOAD_THRESHOLD / 1000).toFixed(0)}k weekly downloads. Remove a tracked package or track packages you maintain.`,
          currentCount: quotaCount,
          limit: maxPackages,
        });
      }
    }
  }

  // Ensure package exists
  await db
    .insertInto('tracked_packages')
    .values({ package_name: pkg })
    .onConflict((oc) => oc.column('package_name').doNothing())
    .execute();

  const pkgRow = await db
    .selectFrom('tracked_packages')
    .select('id')
    .where('package_name', '=', pkg)
    .$narrowType<{ id: number }>()
    .executeTakeFirstOrThrow();

  // Link user to package
  await db
    .insertInto('user_tracked_packages')
    .values({ user_id: userId, package_id: pkgRow.id })
    .onConflict((oc) => oc.columns(['user_id', 'package_id']).doNothing())
    .execute();

  return { success: true };
}

export async function onUntrackPackage(
  pkg: string
): Promise<{ success: boolean }> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  if (isDevMode(env)) {
    devTrackedPackages.delete(pkg);
    return { success: true };
  }

  const db = getDb(env);

  const pkgRow = await db
    .selectFrom('tracked_packages')
    .select('id')
    .where('package_name', '=', pkg)
    .executeTakeFirst();

  if (pkgRow) {
    await db
      .deleteFrom('user_tracked_packages')
      .where('user_id', '=', userId)
      .where('package_id', '=', pkgRow.id)
      .execute();
  }

  return { success: true };
}

export async function onGetTrackedPackages(): Promise<{ packages: string[] }> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  if (isDevMode(env)) {
    return { packages: [...devTrackedPackages].sort() };
  }

  const db = getDb(env);

  const result = await db
    .selectFrom('tracked_packages as tp')
    .innerJoin('user_tracked_packages as utp', 'tp.id', 'utp.package_id')
    .select('tp.package_name')
    .where('utp.user_id', '=', userId)
    .orderBy('tp.package_name')
    .execute();

  return {
    packages: result.map((r) => r.package_name),
  };
}

export async function onIsPackageTracked(
  pkg: string
): Promise<{ tracked: boolean }> {
  const { env, userId } = getContext();

  if (!userId) {
    return { tracked: false };
  }

  if (isDevMode(env)) {
    return { tracked: devTrackedPackages.has(pkg) };
  }

  const db = getDb(env);

  const result = await db
    .selectFrom('tracked_packages as tp')
    .innerJoin('user_tracked_packages as utp', 'tp.id', 'utp.package_id')
    .select('tp.id')
    .where('utp.user_id', '=', userId)
    .where('tp.package_name', '=', pkg)
    .executeTakeFirst();

  return { tracked: !!result };
}

export async function onGetPackageTrackingStatus(
  pkg: string
): Promise<{ status: 'mine' | 'others' | 'none' }> {
  const { env, userId } = getContext();

  if (isDevMode(env)) {
    if (devTrackedPackages.has(pkg) && userId) {
      return { status: 'mine' };
    }
    return { status: 'none' };
  }

  const db = getDb(env);

  const rows = await db
    .selectFrom('tracked_packages as tp')
    .innerJoin('user_tracked_packages as utp', 'tp.id', 'utp.package_id')
    .select('utp.user_id')
    .where('tp.package_name', '=', pkg)
    .execute();

  if (rows.length === 0) {
    return { status: 'none' };
  }

  if (userId && rows.some((r) => r.user_id === userId)) {
    return { status: 'mine' };
  }

  return { status: 'others' };
}
