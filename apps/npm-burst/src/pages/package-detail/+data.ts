import type { PageContextServer } from 'vike/types';

import type { PackageTab } from '../../app/utils/package-route';
import { getDb } from '../../server/db';
import { isDevMode } from '../../server/env';
import {
  getFixturePackageHealthData,
  getPackageHealthData,
} from '../../server/github-health';
import {
  getFixtureSnapshots,
  getFixtureHealthMetrics,
} from '../../server/fixtures/packages';
import { getLatestSnapshot, isPackageTracked } from '../../server/snapshots';
import type { Snapshot } from '../../server/snapshots';
import type { PackageHealthResponse } from '../../server/functions/health.telefunc';

export interface PackageDetailData {
  packageName: string;
  tab: PackageTab;
  /** Whether we have ever snapshotted this package — drives the empty state. */
  isTracked: boolean;
  /**
   * Newest snapshot only. Inlined into the HTML so the client can paint the
   * chart on hydration without a round-trip. The charts themselves are
   * imperative D3 and cannot render server-side, so this is a latency win
   * rather than server-rendered markup.
   */
  latestSnapshot: Snapshot | null;
  /**
   * Health tab only — its charts are declarative SVG, so this genuinely
   * server-renders.
   *
   * `githubUserAuthAvailable` is pinned to false: HTML responses are
   * edge-cached and shared between visitors, so nothing user-specific may be
   * baked in. The client re-fetches to discover the real value.
   */
  health: PackageHealthResponse | null;
}

export async function data(
  pageContext: PageContextServer
): Promise<PackageDetailData> {
  const { packageName, tab } = pageContext.routeParams as {
    packageName: string;
    tab: PackageTab;
  };

  const env = pageContext.requestCtx?.env;

  if (!env || isDevMode(env)) {
    const fixtures = getFixtureSnapshots(packageName);
    return {
      packageName,
      tab,
      isTracked: fixtures.length > 0,
      latestSnapshot: fixtures[fixtures.length - 1] ?? null,
      health:
        tab === 'health'
          ? {
              ...getFixturePackageHealthData(packageName),
              snapshots: getFixtureHealthMetrics(packageName),
              githubUserAuthAvailable: false,
              warnings: [],
            }
          : null,
    };
  }

  const db = getDb(env);

  const [isTracked, latestSnapshot, health] = await Promise.all([
    isPackageTracked(db, packageName),
    getLatestSnapshot(db, packageName),
    tab === 'health'
      ? getPackageHealthData(db, packageName).then((healthData) => ({
          ...healthData,
          githubUserAuthAvailable: false,
          warnings: [],
        }))
      : Promise.resolve(null),
  ]);

  return { packageName, tab, isTracked, latestSnapshot, health };
}
