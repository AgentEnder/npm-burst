import { getContext } from 'telefunc';
import type { HealthMetricSeriesPoint } from '@npm-burst/github-data-access';
import { getDb } from '../db';
import { isDevMode } from '../env';
import {
  getFixturePackageHealthData,
  getPackageHealthData,
} from '../github-health';

export interface PackageHealthResponse {
  packageName: string;
  installationConfigured: boolean;
  repo: { owner: string; name: string } | null;
  filterConfig: Record<string, unknown> | null;
  snapshots: HealthMetricSeriesPoint[];
}

export async function onGetHealthMetrics(
  packageName: string
): Promise<PackageHealthResponse> {
  const { env } = getContext();

  if (isDevMode(env)) {
    return getFixturePackageHealthData(packageName);
  }

  const db = getDb(env);
  return getPackageHealthData(db, packageName);
}
