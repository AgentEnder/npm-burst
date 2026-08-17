import { Card } from './components/card';
import headerStyles from './components/dashboard-header.module.scss';
import { HealthReport } from './components/health-report';
import { LoadingSkeleton } from './components/loading-skeleton';
import { PackageTabs, PackageTitle } from './components/package-tabs';
import type { PackageDetailData } from '../pages/package-detail/+data';

/**
 * Server-rendered view of a package page.
 *
 * Deliberately reads nothing from the zustand store: that store is a
 * module-level singleton, so touching it during SSR would share state between
 * concurrent requests in the same Worker isolate. Everything here comes from
 * `+data` props instead, which makes that leak structurally impossible.
 *
 * This also renders on the client's first pass (see `useHydrated` in
 * `+Page.tsx`) so the markup matches and hydration stays clean.
 *
 * Only the health tab has real content to show: the other tabs' charts are
 * imperative D3 (`d3.select` into a ref inside `useEffect`) and render nothing
 * server-side, so they get a skeleton until the client takes over.
 */
export function PackageShell({ data }: { data: PackageDetailData }) {
  return (
    <Card>
      <div className={headerStyles.wrapper}>
        <div className={headerStyles.titleRow}>
          <PackageTitle packageName={data.packageName} />
        </div>
        <div className={headerStyles.header}>
          <PackageTabs packageName={data.packageName} activeTab={data.tab} />
        </div>
      </div>

      {data.tab === 'health' ? (
        <HealthReport health={data.health} />
      ) : (
        <LoadingSkeleton />
      )}
    </Card>
  );
}
