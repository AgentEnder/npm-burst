import { getContext } from 'telefunc';
import type { HealthMetricKey, MetricSourceData } from '../github-health';
import { getDb } from '../db';
import { isDevMode } from '../env';
import {
  getFixtureMetricSource,
  getPackageMetricSource,
} from '../github-health';

export type { HealthMetricKey, MetricSourceData };

export async function onGetHealthMetricSource(
  packageName: string,
  metricKey: HealthMetricKey
): Promise<MetricSourceData | null> {
  const { env } = getContext();

  if (isDevMode(env)) {
    return getFixtureMetricSource(packageName, metricKey);
  }

  const db = getDb(env);
  return getPackageMetricSource(db, packageName, metricKey);
}
