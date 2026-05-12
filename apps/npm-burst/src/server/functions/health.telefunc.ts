import { Abort, getContext } from 'telefunc';
import type { HealthMetricSeriesPoint } from '@npm-burst/github-data-access';
import {
  getUserGitHubOauthAccess,
  hasUserGitHubOauthAccess,
} from '../clerk-utils';
import { getDb } from '../db';
import { getDevGitHubPat, isDevMode } from '../env';
import {
  type ExternalDataWarning,
  withExternalFallback,
} from '../external-data';
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
  warnings: ExternalDataWarning[];
}

function getEmptyHealthResponse(
  packageName: string,
  githubUserAuthAvailable: boolean,
  warnings: ExternalDataWarning[] = []
): PackageHealthResponse {
  return {
    packageName,
    installationConfigured: false,
    githubUserAuthAvailable,
    repo: null,
    filterConfig: null,
    snapshots: [],
    warnings,
  };
}

export async function onGetHealthMetrics(
  packageName: string
): Promise<PackageHealthResponse> {
  const { env, userId } = getContext();

  if (isDevMode(env) && !getDevGitHubPat(env)) {
    return {
      ...getFixturePackageHealthData(packageName),
      githubUserAuthAvailable: true,
      warnings: [],
    };
  }

  const db = getDb(env);
  const [healthResult, githubAccessResult] = await Promise.all([
    withExternalFallback(
      { source: 'npm', operation: 'load package health data' },
      () => getPackageHealthData(db, packageName),
      () => getEmptyHealthResponse(packageName, false),
      { packageName }
    ),
    userId
      ? withExternalFallback(
          { source: 'clerk', operation: 'load GitHub OAuth availability' },
          () => hasUserGitHubOauthAccess(userId, env),
          false,
          { userId }
        )
      : Promise.resolve({ value: false, warning: null }),
  ]);
  const warnings = [healthResult.warning, githubAccessResult.warning].filter(
    (warning): warning is ExternalDataWarning => warning !== null
  );

  return {
    ...healthResult.value,
    githubUserAuthAvailable: githubAccessResult.value,
    warnings,
  };
}

export async function onRefreshHealthMetricsWithGitHubUserAccess(
  packageName: string
): Promise<PackageHealthResponse> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  if (isDevMode(env) && !getDevGitHubPat(env)) {
    return {
      ...getFixturePackageHealthData(packageName),
      githubUserAuthAvailable: true,
      warnings: [],
    };
  }

  const githubAccessResult = await withExternalFallback(
    { source: 'clerk', operation: 'load GitHub OAuth token' },
    () => getUserGitHubOauthAccess(userId, env),
    null,
    { userId }
  );
  const githubAccess = githubAccessResult.value;
  if (!githubAccess) {
    throw Abort({ reason: 'Connect your GitHub account first.' });
  }

  const db = getDb(env);
  const repo = await ensureGitHubRepoForPackage(db, packageName);
  if (!repo) {
    throw Abort({
      reason: 'No linked GitHub repository found for this package.',
    });
  }

  const snapshotResult = await withExternalFallback(
    { source: 'github', operation: 'refresh GitHub health snapshot' },
    () =>
      snapshotGitHubHealthForRepo(
        db,
        { id: repo.id, owner: repo.owner, name: repo.name },
        githubAccess.token
      ),
    undefined,
    { packageName, owner: repo.owner, repo: repo.name }
  );

  const warnings = [githubAccessResult.warning, snapshotResult.warning].filter(
    (warning): warning is ExternalDataWarning => warning !== null
  );

  return {
    ...(await getPackageHealthData(db, packageName)),
    githubUserAuthAvailable: true,
    warnings,
  };
}
