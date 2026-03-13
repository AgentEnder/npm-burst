import { useEffect, useState } from 'react';
import {
  Package,
  Shield,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Card } from './components/card';
import { onGetUsageInfo } from '../server/functions/usage.telefunc';
import type {
  UsageInfo,
  TrackedPackageInfo,
} from '../server/functions/usage.telefunc';
import { useSafeAuth } from './context/auth-context';
import styles from './usage-page.module.scss';

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function QuotaBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min((used / limit) * 100, 100);
  const isFull = used >= limit;

  return (
    <div className={styles.quotaSection}>
      <div className={styles.quotaHeader}>
        <span className={styles.quotaLabel}>Tracking Quota</span>
        <span
          className={`${styles.quotaCount} ${isFull ? styles.quotaFull : ''}`}
        >
          {used} / {limit} slots used
        </span>
      </div>
      <div className={styles.quotaBarTrack}>
        <div
          className={`${styles.quotaBarFill} ${isFull ? styles.quotaBarFull : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={styles.quotaHint}>
        Packages with 500k+ weekly downloads and packages you maintain don't
        count against your quota.
      </p>
    </div>
  );
}

function MaintainerEmails({
  maintainers,
}: {
  maintainers: TrackedPackageInfo['maintainers'];
}) {
  const [expanded, setExpanded] = useState(false);

  if (maintainers.length === 0)
    return <span className={styles.muted}>None listed</span>;

  return (
    <div>
      <button
        className={styles.expandButton}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {maintainers.length} maintainer{maintainers.length !== 1 ? 's' : ''}
      </button>
      {expanded && (
        <ul className={styles.maintainerList}>
          {maintainers.map((m) => (
            <li key={m.email}>
              <span className={styles.maintainerName}>{m.name}</span>
              <span className={styles.maintainerEmail}>{m.email}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PackageRow({ pkg }: { pkg: TrackedPackageInfo }) {
  const base = import.meta.env.BASE_URL || '/';
  const baseNormalized = base.endsWith('/') ? base : base + '/';
  const packageUrl = `${baseNormalized}package#/${encodeURIComponent(pkg.packageName)}`;

  return (
    <tr className={pkg.countsAgainstQuota ? styles.quotaRow : styles.exemptRow}>
      <td>
        <a href={packageUrl} className={styles.packageLink}>
          <Package size={14} />
          {pkg.packageName}
          <ExternalLink size={12} className={styles.linkIcon} />
        </a>
      </td>
      <td className={styles.dlCell}>{formatDownloads(pkg.weeklyDownloads)}</td>
      <td>
        {pkg.isLargePackage && (
          <span className={styles.badge + ' ' + styles.badgeLarge}>500k+</span>
        )}
        {pkg.isMaintainer && (
          <span className={styles.badge + ' ' + styles.badgeMaintainer}>
            <Shield size={12} /> Maintainer
          </span>
        )}
        {pkg.countsAgainstQuota && (
          <span className={styles.badge + ' ' + styles.badgeQuota}>Counts</span>
        )}
      </td>
      <td>
        <MaintainerEmails maintainers={pkg.maintainers} />
      </td>
    </tr>
  );
}

export function UsagePage() {
  const auth = useSafeAuth();
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isSignedIn) return;
    setLoading(true);
    onGetUsageInfo()
      .then(setUsage)
      .catch((e) => setError(e?.message ?? 'Failed to load usage info'))
      .finally(() => setLoading(false));
  }, [auth.isSignedIn]);

  if (!auth.isLoaded) return null;

  if (!auth.isSignedIn) {
    return (
      <main className={styles.main}>
        <Card>
          <div className={styles.emptyState}>
            <AlertTriangle size={48} color="var(--warning-main, #f5a623)" />
            <h2>Sign in required</h2>
            <p>You need to be signed in to view your usage.</p>
          </div>
        </Card>
      </main>
    );
  }

  if (loading) {
    return (
      <main className={styles.main}>
        <Card>
          <div className={styles.emptyState}>
            <p>Loading usage data...</p>
          </div>
        </Card>
      </main>
    );
  }

  if (error || !usage) {
    return (
      <main className={styles.main}>
        <Card>
          <div className={styles.emptyState}>
            <AlertTriangle size={48} color="var(--error-main, #e53935)" />
            <h2>Error</h2>
            <p>{error ?? 'Failed to load usage info'}</p>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <h1 className={styles.pageTitle}>Usage & Tracking</h1>

      <Card>
        <QuotaBar used={usage.quotaUsed} limit={usage.quotaLimit} />
      </Card>

      <Card>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Your Emails</h2>
          <p className={styles.sectionHint}>
            These emails are checked against package maintainer lists. Add
            emails in your Clerk profile to match more packages.
          </p>
          <ul className={styles.emailList}>
            {usage.userEmails.map((email) => (
              <li key={email} className={styles.emailItem}>
                {email}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Tracked Packages ({usage.trackedPackages.length})
          </h2>
          {usage.trackedPackages.length === 0 ? (
            <p className={styles.muted}>No packages tracked yet.</p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Weekly Downloads</th>
                    <th>Status</th>
                    <th>Maintainers</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.trackedPackages.map((pkg) => (
                    <PackageRow key={pkg.packageName} pkg={pkg} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </main>
  );
}
