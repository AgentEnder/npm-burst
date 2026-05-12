import { Abort, getContext } from 'telefunc';
import { buildGitHubAppInstallPath } from '../github-app';
import { getDb } from '../db';
import { isDevMode } from '../env';
import {
  type ExternalDataWarning,
  withExternalFallback,
} from '../external-data';
import { getUserEmails, getUserGitHubOauthAccess } from '../clerk-utils';
import { isUserMaintainer } from '../npm-maintainers';
import type { NpmMaintainer } from '../npm-maintainers';
import { getPackageWeeklyDownloads } from '../npm-downloads';
import {
  ensureTrackedPackageMetadata,
  parseStoredPackageMetadataRow,
} from '../package-metadata';
import {
  DEFAULT_MAX_TRACKED_PACKAGES,
  WEEKLY_DOWNLOAD_THRESHOLD,
  getUserQuota,
} from '../constants';
import {
  getFixturePackage,
  getAllFixturePackageNames,
} from '../fixtures/packages';

export interface GitHubInstallationCandidate {
  owner: string;
  packageNames: string[];
  installPath: string;
}

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
  githubOauthConnected: boolean;
  githubOauthScopes: string[];
  githubInstallationCandidates: GitHubInstallationCandidate[];
  warnings: ExternalDataWarning[];
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
      warnings: [],
    };
  }

  const db = getDb(env);
  const { request } = getContext();
  const [userEmailsResult, quotaLimit, githubOauthResult] = await Promise.all([
    withExternalFallback(
      { source: 'clerk', operation: 'load user emails' },
      () => getUserEmails(userId, env),
      [],
      { userId }
    ),
    getUserQuota(db, userId),
    withExternalFallback(
      { source: 'clerk', operation: 'load GitHub OAuth access' },
      () => getUserGitHubOauthAccess(userId, env),
      null,
      { userId }
    ),
  ]);
  const warnings: ExternalDataWarning[] = [
    userEmailsResult.warning,
    githubOauthResult.warning,
  ].filter((warning): warning is ExternalDataWarning => warning !== null);
  const userEmails = userEmailsResult.value;
  const githubOauth = githubOauthResult.value;

  const trackedPkgs = await db
    .selectFrom('tracked_packages as tp')
    .innerJoin('user_tracked_packages as utp', 'tp.id', 'utp.package_id')
    .select([
      'tp.package_name',
      'tp.maintainers_json',
      'tp.github_owner',
      'tp.github_repo_name',
      'tp.metadata_refreshed_at',
    ])
    .where('utp.user_id', '=', userId)
    .orderBy('tp.package_name')
    .execute();

  const trackedPackageResults = await Promise.all(
    trackedPkgs.map(async (row) => {
      const storedMetadata = parseStoredPackageMetadataRow(row);
      const metadataPromise =
        storedMetadata.metadataRefreshedAt &&
        storedMetadata.metadataRefreshedAt.slice(0, 10) ===
          new Date().toISOString().slice(0, 10)
          ? Promise.resolve(storedMetadata)
          : ensureTrackedPackageMetadata(db, row.package_name);

      const [weeklyDownloadsResult, metadataResult] = await Promise.all([
        withExternalFallback(
          { source: 'npm', operation: 'load weekly downloads' },
          () => getPackageWeeklyDownloads(db, row.package_name),
          0,
          { packageName: row.package_name }
        ),
        withExternalFallback(
          { source: 'npm', operation: 'refresh tracked package metadata' },
          () => metadataPromise,
          storedMetadata,
          { packageName: row.package_name }
        ),
      ]);
      const metadata = metadataResult.value;
      const weeklyDownloads = weeklyDownloadsResult.value;
      const maintainers = metadata.maintainers;
      const isLargePackage = weeklyDownloads >= WEEKLY_DOWNLOAD_THRESHOLD;
      const isMaintainer = isUserMaintainer(userEmails, maintainers);
      const countsAgainstQuota = !isLargePackage && !isMaintainer;
      return {
        pkg: {
          packageName: row.package_name,
          weeklyDownloads,
          isLargePackage,
          isMaintainer,
          maintainers,
          countsAgainstQuota,
        },
        metadata,
        warnings: [
          weeklyDownloadsResult.warning,
          metadataResult.warning,
        ].filter((warning): warning is ExternalDataWarning => warning !== null),
      };
    })
  );
  const trackedPackages: TrackedPackageInfo[] = trackedPackageResults.map(
    (result) => result.pkg
  );
  warnings.push(...trackedPackageResults.flatMap((result) => result.warnings));
  const quotaUsed = trackedPackages.filter((p) => p.countsAgainstQuota).length;

  const githubRepos = trackedPackageResults
    .map((result) => result.metadata)
    .flatMap((metadata) => (metadata.githubRepo ? [metadata.githubRepo] : []));

  const installedRepoRows =
    githubRepos.length === 0
      ? []
      : await db
          .selectFrom('github_repos')
          .select(['owner', 'name', 'installation_id'])
          .where((eb) =>
            eb.or(
              githubRepos.map((repo) =>
                eb.and([
                  eb('owner', '=', repo.owner),
                  eb('name', '=', repo.name),
                ])
              )
            )
          )
          .execute();

  const installationByRepo = new Map(
    installedRepoRows.map((row) => [
      `${row.owner}/${row.name}`,
      row.installation_id,
    ])
  );

  const installationMap = new Map<string, Set<string>>();
  for (const [index, pkg] of trackedPackages.entries()) {
    const metadata = trackedPackageResults[index].metadata;
    if (!pkg.isMaintainer || !metadata?.githubRepo) {
      continue;
    }

    const repoKey = `${metadata.githubRepo.owner}/${metadata.githubRepo.name}`;
    if ((installationByRepo.get(repoKey) ?? null) !== null) {
      continue;
    }

    if (!installationMap.has(metadata.githubRepo.owner)) {
      installationMap.set(metadata.githubRepo.owner, new Set());
    }
    installationMap.get(metadata.githubRepo.owner)!.add(pkg.packageName);
  }

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
    warnings,
  };
}
