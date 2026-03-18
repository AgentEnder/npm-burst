import { Abort, getContext } from 'telefunc';
import type { HealthMetricSeriesPoint } from '@npm-burst/github-data-access';
import { buildGitHubAppInstallPath } from '../github-app';
import { getDb } from '../db';
import { isDevMode } from '../env';
import { getUserEmails, getUserGitHubOauthAccess } from '../clerk-utils';
import { getPackageMaintainers, isUserMaintainer } from '../npm-maintainers';
import type { NpmMaintainer } from '../npm-maintainers';
import { getPackageWeeklyDownloads } from '../npm-downloads';
import {
  DEFAULT_MAX_TRACKED_PACKAGES,
  WEEKLY_DOWNLOAD_THRESHOLD,
  getUserQuota,
} from '../constants';
import {
  getFixturePackage,
  getAllFixturePackageNames,
} from '../fixtures/packages';
import { getFixturePackageHealthData, getPackageHealthData } from '../github-health';

interface HealthSummary {
  repo: { owner: string; name: string } | null;
  latestSnapshotDate: string | null;
  issueCloseRatio: number | null;
  medianIssueFirstResponseHours: number | null;
  medianPrFirstReviewHours: number | null;
}

export interface GitHubInstallationCandidate {
  owner: string;
  packageNames: string[];
  installPath: string;
}

function getHealthSummary(
  snapshots: HealthMetricSeriesPoint[]
): HealthSummary {
  const latest = snapshots[snapshots.length - 1];
  return {
    repo: null,
    latestSnapshotDate: latest?.snapshotDate ?? null,
    issueCloseRatio:
      latest && latest.issuesOpened30d > 0
        ? latest.issuesClosed30d / latest.issuesOpened30d
        : null,
    medianIssueFirstResponseHours:
      latest?.medianIssueFirstResponseHours ?? null,
    medianPrFirstReviewHours: latest?.medianPrFirstReviewHours ?? null,
  };
}

export interface TrackedPackageInfo {
  packageName: string;
  weeklyDownloads: number;
  isLargePackage: boolean;
  isMaintainer: boolean;
  maintainers: NpmMaintainer[];
  countsAgainstQuota: boolean;
  health: HealthSummary;
}

export interface UsageInfo {
  trackedPackages: TrackedPackageInfo[];
  quotaUsed: number;
  quotaLimit: number;
  downloadThreshold: number;
  userEmails: string[];
  githubOauthConnected: boolean;
  githubOauthScopes: string[];
  githubInstallationCandidates: GitHubInstallationCandidate[];
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
          health: {
            ...getHealthSummary(getFixturePackageHealthData(name).snapshots),
            repo: getFixturePackageHealthData(name).repo,
          },
        };
      }
    );
    return {
      trackedPackages: devPackages,
      quotaUsed: devPackages.filter((p) => p.countsAgainstQuota).length,
      quotaLimit: DEFAULT_MAX_TRACKED_PACKAGES,
      downloadThreshold: WEEKLY_DOWNLOAD_THRESHOLD,
      userEmails: ['dev@example.com'],
      githubOauthConnected: true,
      githubOauthScopes: ['public_repo'],
      githubInstallationCandidates: [
        {
          owner: 'nrwl',
          packageNames: ['nx'],
          installPath: '/api/github/install?owner=nrwl&returnTo=%2Fusage',
        },
      ],
    };
  }

  const db = getDb(env);
  const { request } = getContext();
  const [userEmails, quotaLimit, githubOauth] = await Promise.all([
    getUserEmails(userId, env),
    getUserQuota(db, userId),
    getUserGitHubOauthAccess(userId, env),
  ]);

  const trackedPkgs = await db
    .selectFrom('tracked_packages as tp')
    .innerJoin('user_tracked_packages as utp', 'tp.id', 'utp.package_id')
    .select('tp.package_name')
    .where('utp.user_id', '=', userId)
    .orderBy('tp.package_name')
    .execute();

  const trackedPackages: TrackedPackageInfo[] = await Promise.all(
    trackedPkgs.map(async (row) => {
      const [weeklyDownloads, maintainers, healthData] = await Promise.all([
        getPackageWeeklyDownloads(db, row.package_name),
        getPackageMaintainers(db, row.package_name),
        getPackageHealthData(db, row.package_name),
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
        health: {
          ...getHealthSummary(healthData.snapshots),
          repo: healthData.repo,
        },
      };
    })
  );
  const quotaUsed = trackedPackages.filter((p) => p.countsAgainstQuota).length;

  const allTrackedPackages = await db
    .selectFrom('tracked_packages')
    .select('package_name')
    .orderBy('package_name')
    .execute();

  const installationMap = new Map<string, Set<string>>();
  await Promise.all(
    allTrackedPackages.map(async (row) => {
      const maintainers = await getPackageMaintainers(db, row.package_name);
      if (!isUserMaintainer(userEmails, maintainers)) return;

      const repo = await getPackageHealthData(db, row.package_name).then((data) =>
        data.repo ? data : null
      );
      if (!repo?.repo) return;

      const resolved = await db
        .selectFrom('github_repo_packages as grp')
        .innerJoin('github_repos as gr', 'gr.id', 'grp.repo_id')
        .select(['gr.owner', 'gr.installation_id'])
        .where('grp.package_name', '=', row.package_name)
        .executeTakeFirst();

      if (!resolved || resolved.installation_id !== null) return;

      if (!installationMap.has(resolved.owner)) {
        installationMap.set(resolved.owner, new Set());
      }
      installationMap.get(resolved.owner)!.add(row.package_name);
    })
  );

  const githubInstallationCandidates = [...installationMap.entries()]
    .map(([owner, packages]) => ({
      owner,
      packageNames: [...packages].sort(),
      installPath: buildGitHubAppInstallPath(request, owner, '/usage'),
    }))
    .sort((a, b) => a.owner.localeCompare(b.owner));

  return {
    trackedPackages,
    quotaUsed,
    quotaLimit,
    downloadThreshold: WEEKLY_DOWNLOAD_THRESHOLD,
    userEmails,
    githubOauthConnected: githubOauth !== null,
    githubOauthScopes: githubOauth?.scopes ?? [],
    githubInstallationCandidates,
  };
}
