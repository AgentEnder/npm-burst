import { useData } from 'vike-react/useData';
import { useHydrated } from 'vike-react/useHydrated';

import { PackageDashboard } from '../../app/package-dashboard';
import { PackageShell } from '../../app/package-shell';
import type { PackageDetailData } from './+data';

/**
 * `useHydrated()` is false on the server *and* on the client's first render,
 * flipping to true only once hydration completes. That gives a clean seam:
 * the store-free shell renders identically on both sides (so hydration never
 * mismatches), and the store-driven dashboard mounts only in the browser.
 */
export default function Page() {
  const data = useData<PackageDetailData>();
  const hydrated = useHydrated();

  if (!hydrated) {
    return <PackageShell data={data} />;
  }

  return <PackageDashboard seed={data} />;
}
