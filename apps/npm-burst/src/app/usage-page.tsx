import { useEffect, useState } from 'react';
import {
  Package,
  Shield,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Plus,
  Github,
} from 'lucide-react';
import { Card } from './components/card';
import { onGetUsageInfo } from '../server/functions/usage.telefunc';
import type {
  UsageInfo,
  TrackedPackageInfo,
} from '../server/functions/usage.telefunc';
import { useClerk } from '@clerk/clerk-react';
import { useSafeAuth } from './context/auth-context';
import { useWarningToast } from './hooks/use-warning-toast';
import styles from './usage-page.module.scss';

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function AddEmailButton() {
  const { openUserProfile } = useClerk();
  return (
    <button className={styles.addEmailButton} onClick={() => openUserProfile()}>
      <Plus size={14} />
      Add email
    </button>
  );
}

function ConnectGitHubButton() {
  const { openUserProfile } = useClerk();
  return (
    <button className={styles.connectGitHubButton} onClick={() => openUserProfile()}>
      <Github size={14} />
      Connect GitHub
    </button>
  );
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
          className={`${styles.quotaBarFill} ${
            isFull ? styles.quotaBarFull : ''
          }`}
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
  const packageUrl = `${baseNormalized}package#/${encodeURIComponent(
    pkg.packageName
  )}`;

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
        {pkg.isMaintainer ? (
          <span className={styles.badge + ' ' + styles.badgeMaintainer}>
            <Shield size={12} /> Maintainer
          </span>
        ) : pkg.isLargePackage ? (
          <span className={styles.badge + ' ' + styles.badgeLarge}>
            500k+ exempt
          </span>
        ) : (
          <span className={styles.badge + ' ' + styles.badgeQuota}>
            Uses slot
          </span>
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
  const installStatus =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('github-install')
      : null;
  const installOwner =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('owner')
      : null;

  useWarningToast('usage-page', usage?.warnings ?? []);

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

      <Card className={styles.fullWidthCard}>
        {installStatus === 'pending' && (
          <div className={styles.noticeBanner}>
            <Github size={16} />
            <span>
              GitHub App installation for {installOwner ?? 'your account'} was
              started. The repository access will appear here once GitHub sends
              the installation webhook.
            </span>
          </div>
        )}
        {usage.warnings.length > 0 && (
          <div className={styles.noticeBanner}>
            <AlertTriangle size={16} />
            <span>
              Some external data could not be loaded, so this page may be showing
              partial results.
            </span>
          </div>
        )}

        <QuotaBar used={usage.quotaUsed} limit={usage.quotaLimit} />

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>GitHub Account</h2>
          <p className={styles.sectionHint}>
            Connect your GitHub account in Clerk to run one-off health snapshots for
            packages you view, even when the repo owner hasn&apos;t installed the
            GitHub App.
          </p>
          <div className={styles.githubAuthCard}>
            <div>
              <div className={styles.githubAuthTitle}>
                {usage.githubOauthConnected
                  ? 'GitHub account connected'
                  : 'GitHub account not connected'}
              </div>
              <div className={styles.githubAuthMeta}>
                {usage.githubOauthConnected
                  ? usage.githubOauthScopes.length > 0
                    ? `Granted scopes: ${usage.githubOauthScopes.join(', ')}`
                    : 'GitHub OAuth token available for repo health lookups.'
                  : 'Open your account profile to add GitHub as a connected account.'}
              </div>
            </div>
            {!usage.githubOauthConnected ? <ConnectGitHubButton /> : null}
          </div>
        </div>

        {usage.githubInstallationCandidates.length > 0 && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>GitHub App Installation</h2>
            <p className={styles.sectionHint}>
              Install the GitHub App on repo owners you maintain so npm-burst
              can snapshot issue and pull request health without manual DB
              setup.
            </p>
            <div className={styles.installList}>
              {usage.githubInstallationCandidates.map((candidate) => (
                <div key={candidate.owner} className={styles.installCard}>
                  <div>
                    <div className={styles.installOwner}>{candidate.owner}</div>
                    <div className={styles.installPackages}>
                      {candidate.packageNames.join(', ')}
                    </div>
                  </div>
                  <a href={candidate.installPath} className={styles.installButton}>
                    Install App
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

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
            <li>
              <AddEmailButton />
            </li>
          </ul>
        </div>

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
