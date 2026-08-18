import { useData } from 'vike-react/useData';

import { PackageSearch } from './components/package-search';
import { buildPackagePath } from './utils/package-route';
import type { IndexData } from '../pages/index/+data';
import styles from './landing-page.module.scss';

/**
 * Fallback for a fresh instance that is not yet tracking anything, so the
 * page always offers somewhere to go.
 */
const FALLBACK_PACKAGES = [
  'react',
  'typescript',
  'nx',
  'vite',
  'express',
  'eslint',
];

export function LandingPage() {
  const { trackedPackages } = useData<IndexData>();
  const handleSelectPackage = (pkg: string) => {
    window.location.href = buildPackagePath(pkg);
  };

  const hasTracked = trackedPackages.length > 0;
  const packages = hasTracked ? trackedPackages : FALLBACK_PACKAGES;

  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>npm download analytics</p>
        <h1 className={styles.title}>
          See which versions people actually install.
        </h1>
        <p className={styles.subtitle}>
          Look up any package on the npm registry and see its weekly downloads
          split by major, minor and patch version.
        </p>

        <div className={styles.searchContainer}>
          <PackageSearch onSelectPackage={handleSelectPackage} />
        </div>
      </section>

      <section className={styles.tracked} aria-labelledby="tracked-heading">
        <h2 className={styles.trackedHeading} id="tracked-heading">
          {hasTracked ? 'Tracked here' : 'Start with one of these'}
        </h2>
        <ul className={styles.packageList}>
          {packages.map((pkg) => (
            <li key={pkg}>
              <a className={styles.packageLink} href={buildPackagePath(pkg)}>
                {pkg}
              </a>
            </li>
          ))}
        </ul>
        {hasTracked && (
          <p className={styles.trackedNote}>
            These have daily snapshots, so their history goes back further than
            a package looked up for the first time.
          </p>
        )}
      </section>
    </main>
  );
}
