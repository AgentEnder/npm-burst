import { PieChart, History, Star, Filter } from 'lucide-react';
import { PackageSearch } from './components/package-search';
import styles from './landing-page.module.scss';

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className={styles.featureCard}>
      <div className={styles.featureIcon}>{icon}</div>
      <h3 className={styles.featureTitle}>{title}</h3>
      <p className={styles.featureDescription}>{description}</p>
    </div>
  );
}

export function LandingPage() {
  const handleSelectPackage = (pkg: string) => {
    // Navigate to the package dashboard page.
    // BASE_URL is /npm-burst (from vite.config.ts base).
    const base = import.meta.env.BASE_URL || '/';
    // Ensure trailing slash before 'package'
    const baseNormalized = base.endsWith('/') ? base : base + '/';
    window.location.href = `${baseNormalized}package#/${encodeURIComponent(
      pkg
    )}`;
  };

  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <h1 className={styles.title}>
          Npm <span className={styles.titleAccent}>Burst</span>
        </h1>
        <p className={styles.subtitle}>
          Visualize npm package download distributions across versions
        </p>
        <div className={styles.searchContainer}>
          <PackageSearch onSelectPackage={handleSelectPackage} />
        </div>
      </section>

      <section className={styles.features}>
        <h2 className={styles.featuresHeading}>What you can do</h2>
        <div className={styles.featureGrid}>
          <FeatureCard
            icon={<PieChart size={28} />}
            title="Version Breakdown"
            description="Interactive sunburst chart showing download distribution across major, minor, and patch versions."
          />
          <FeatureCard
            icon={<History size={28} />}
            title="Historical Snapshots"
            description="Track how download patterns change over time with daily snapshots and a visual timeline."
          />
          <FeatureCard
            icon={<Star size={28} />}
            title="Track Packages"
            description="Sign in to track your favorite packages and automatically collect daily download snapshots."
          />
          <FeatureCard
            icon={<Filter size={28} />}
            title="Smart Filtering"
            description="Low-pass filter aggregates small versions so you can focus on the versions that matter most."
          />
        </div>
      </section>
    </main>
  );
}
