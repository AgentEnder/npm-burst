import { Abort, getContext } from 'telefunc';
import type { HealthMetricSeriesPoint } from '@npm-burst/github-data-access';
import { getUserGitHubOauthAccess, hasUserGitHubOauthAccess } from '../clerk-utils';
import { getDb } from '../db';
import { isDevMode } from '../env';
import {
  ensureGitHubRepoForPackage,
  getFixturePackageHealthData,
  getPackageHealthData,
} from '../github-health';
import { snapshotGitHubHealthForRepo } from '../github-health-snapshot';

export interface PackageHealthResponse {
  packageName: string;
  installationConfigured: boolean;
  githubUserAuthAvailable: boolean;
  repo: { owner: string; name: string } | null;
  filterConfig: Record<string, unknown> | null;
  snapshots: HealthMetricSeriesPoint[];
}

export async function onGetHealthMetrics(
  packageName: string
): Promise<PackageHealthResponse> {
  const { env, userId } = getContext();

  if (isDevMode(env)) {
    return {
      ...getFixturePackageHealthData(packageName),
      githubUserAuthAvailable: true,
    };
  }

  const db = getDb(env);
  const [healthData, githubUserAuthAvailable] = await Promise.all([
    getPackageHealthData(db, packageName),
    userId ? hasUserGitHubOauthAccess(userId, env) : Promise.resolve(false),
  ]);

  return {
    ...healthData,
    githubUserAuthAvailable,
  };
}

export async function onRefreshHealthMetricsWithGitHubUserAccess(
  packageName: string
): Promise<PackageHealthResponse> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  if (isDevMode(env)) {
    return {
      ...getFixturePackageHealthData(packageName),
      githubUserAuthAvailable: true,
    };
  }

  const githubAccess = await getUserGitHubOauthAccess(userId, env);
  if (!githubAccess) {
    throw Abort({ reason: 'Connect your GitHub account first.' });
  }

  const db = getDb(env);
  const repo = await ensureGitHubRepoForPackage(db, packageName);
  if (!repo) {
    throw Abort({ reason: 'No linked GitHub repository found for this package.' });
  }

  await snapshotGitHubHealthForRepo(
    db,
    { id: repo.id, owner: repo.owner, name: repo.name },
    githubAccess.token
  );

  return {
    ...(await getPackageHealthData(db, packageName)),
    githubUserAuthAvailable: true,
  };
}
