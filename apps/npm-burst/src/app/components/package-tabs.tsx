import { ExternalLink } from 'lucide-react';
import { memo } from 'react';
import {
  buildPackagePath,
  PACKAGE_TABS,
  type PackageTab,
} from '../utils/package-route';
import { SegmentedControl } from './segmented-control';
import styles from './dashboard-header.module.scss';

const TAB_LABELS: Record<PackageTab, string> = {
  sunburst: 'Breakdown',
  adoption: 'Adoption',
  migration: 'Migration',
  lifecycle: 'Lifecycle',
  health: 'Health',
};

export const PACKAGE_TAB_OPTIONS = PACKAGE_TABS.map((value) => ({
  value,
  label: TAB_LABELS[value],
}));

/**
 * Tab bar for a package. Store-free by design so the server can render it —
 * the active tab comes from the route, not from client state.
 */
export const PackageTabs = memo(function PackageTabs({
  packageName,
  activeTab,
}: {
  packageName: string;
  activeTab: PackageTab;
}) {
  return (
    <SegmentedControl
      options={PACKAGE_TAB_OPTIONS}
      value={activeTab}
      ariaLabel="Package view"
      hrefFor={(tab) => buildPackagePath(packageName, tab)}
      // Only reached via the mobile <select>, which can't be an anchor.
      onChange={(tab) => {
        if (typeof window !== 'undefined') {
          window.location.href = buildPackagePath(packageName, tab);
        }
      }}
    />
  );
});

/** Package name + link out to npm. Store-free, shared by the shell and header. */
export const PackageTitle = memo(function PackageTitle({
  packageName,
}: {
  packageName: string;
}) {
  return (
    <h1 className={styles.pageTitle}>
      Data for{' '}
      <a
        href={`https://www.npmjs.com/package/${packageName}`}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.packageLink}
      >
        <span className={styles.packageName}>{packageName}</span>
        <ExternalLink size={14} className={styles.externalIcon} />
      </a>
    </h1>
  );
});
