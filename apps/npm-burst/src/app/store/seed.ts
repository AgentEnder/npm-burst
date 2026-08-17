import type { PackageDetailData } from '../../pages/package-detail/+data';
import type { AppState } from './app-store';
import { appStore } from './app-store';

/**
 * The single seam between server-provided route data and the client store.
 *
 * Everything the server knows enters the store here and nowhere else. Keeping
 * it to one function is deliberate: the store is a module-level singleton, so
 * if it ever needs to become per-request (a React-context store), this is the
 * only call site that has to change.
 *
 * Runs during the dashboard's first client render — never on the server, which
 * must not touch the store at all.
 */
export function seedPackageStore(seed: PackageDetailData): void {
  const state = appStore.getState();
  const isSamePackage = state.npmPackageName === seed.packageName;

  const updates: Partial<AppState> = { viewMode: seed.tab };

  if (!isSamePackage) {
    updates.npmPackageName = seed.packageName;
    updates.selectedVersion = null;
    updates.expandedNodes = [];
    updates.snapshotIndex = null;
  }

  // Seed the newest snapshot so the chart can paint from inlined HTML data.
  // Never clobber a fuller history the client has already loaded.
  if (seed.latestSnapshot && (!isSamePackage || state.snapshots.length === 0)) {
    updates.snapshots = [seed.latestSnapshot];
  }

  // `githubUserAuthAvailable` is always false in server data (it is
  // user-specific and the HTML is shared), so let a client-fetched value win.
  if (seed.health && (!isSamePackage || state.health === null)) {
    updates.health = seed.health;
  }

  appStore.setState(updates);
  appStore.getState().recomputeChartData();
}
