import { RefreshCw } from 'lucide-react';
import { useHealthRefresh } from '../hooks/use-health-refresh';
import { useAppStore } from '../store';
import { formatAbsoluteTime, formatRelativeTime } from '../utils/relative-time';
import { Popover } from './popover';
import styles from './health-refresh-control.module.scss';

const BLOCKED_REASON: Record<'signIn' | 'linkGitHub', string> = {
  signIn: 'Sign in with GitHub to refresh with your personal access.',
  linkGitHub:
    'Connect your GitHub account to refresh with your personal access.',
};

/**
 * "Last refreshed" plus an icon-only refresh, sized to sit inside the tab
 * strip alongside the other per-tab controls rather than occupying a banner
 * row of its own.
 *
 * Only rendered once there are snapshots — with nothing captured yet the
 * empty state owns the call to action instead.
 */
export function HealthRefreshControl() {
  const health = useAppStore((s) => s.health);
  const packageName = useAppStore((s) => s.npmPackageName);
  const { action, syncing, error, authPending, activate } = useHealthRefresh(
    health?.githubUserAuthAvailable === true
  );

  if (!health || health.snapshots.length === 0) return null;

  const relative = formatRelativeTime(health.lastRefreshedAt);
  const absolute = formatAbsoluteTime(health.lastRefreshedAt);
  const blockedReason = action === 'refresh' ? null : BLOCKED_REASON[action];

  const button = (
    <button
      type="button"
      className={`${styles.button} ${
        blockedReason ? styles.buttonBlocked : ''
      } ${syncing ? styles.syncing : ''}`}
      onClick={() => activate(packageName)}
      disabled={syncing || authPending}
      aria-disabled={blockedReason !== null}
      aria-label={
        blockedReason
          ? `Refresh with GitHub — ${blockedReason}`
          : 'Refresh with GitHub'
      }
    >
      <RefreshCw size={13} className={styles.icon} aria-hidden="true" />
      {syncing ? 'Refreshing…' : relative ? `Updated ${relative}` : 'Refresh'}
    </button>
  );

  return (
    <>
      <Popover
        content={blockedReason ?? absolute ?? 'Refresh with your GitHub access'}
        trigger="hover"
        position="below"
      >
        {button}
      </Popover>
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
