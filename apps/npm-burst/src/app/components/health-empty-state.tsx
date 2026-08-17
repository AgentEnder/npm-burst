import { SiGithub } from '@icons-pack/react-simple-icons';
import { useEffect, useState } from 'react';
import { onGetPackageMaintainerStatus } from '../../server/functions/health.telefunc';
import { HealthEmptyShell } from './health-empty-shell';
import {
  resolveHealthEmptyPlan,
  type HealthEmptyAction,
} from './health-empty-state-model';
import styles from './health-report.module.scss';

export interface HealthEmptyStateProps {
  packageName: string;
  repo: { owner: string; name: string };
  /** Whether the GitHub App is installed for this repo's owner. */
  appInstalled: boolean;
  isSignedIn: boolean;
  /** Whether the signed-in user has a usable GitHub OAuth token. */
  githubLinked: boolean;
  authPending: boolean;
  syncing: boolean;
  syncError: string | null;
  onSnapshot: () => void;
  onSignIn: () => void;
  onConnectGitHub: () => void;
}

const ACTION_LABELS: Record<HealthEmptyAction, string> = {
  signIn: 'Sign in with GitHub',
  connectGitHub: 'Connect GitHub',
  snapshot: 'Fetch a snapshot',
  install: 'Install GitHub App',
};

const SECONDARY_LABELS: Record<HealthEmptyAction, string> = {
  signIn: 'or sign in',
  connectGitHub: 'or connect your GitHub account',
  snapshot: 'or pull a one-off snapshot',
  install: 'or install the GitHub App',
};

/**
 * Shown when a package has a GitHub repo but no health report to display.
 *
 * Which action leads is decided by `resolveHealthEmptyPlan`, so the state
 * matrix (signed in × GitHub linked × maintainer × app installed) lives in one
 * tested pure function rather than in nested JSX conditionals.
 *
 * Maintainer detection is an email match against the npm maintainer list, so
 * it is a heuristic: a false negative just reorders the two actions. Nothing
 * is gated on it — GitHub does the real authorization at install time.
 */
export function HealthEmptyState({
  packageName,
  repo,
  appInstalled,
  isSignedIn,
  githubLinked,
  authPending,
  syncing,
  syncError,
  onSnapshot,
  onSignIn,
  onConnectGitHub,
}: HealthEmptyStateProps) {
  const [isMaintainer, setIsMaintainer] = useState(false);

  // User-specific, so it can't come from `+data` — that HTML is edge-cached
  // and shared between visitors. Asked for after hydration instead.
  useEffect(() => {
    if (!isSignedIn) return;

    let cancelled = false;
    onGetPackageMaintainerStatus(packageName)
      .then((status) => {
        if (!cancelled) setIsMaintainer(status.isMaintainer);
      })
      .catch(() => {
        /* non-fatal: the plan just treats them as a non-maintainer */
      });

    return () => {
      cancelled = true;
    };
  }, [packageName, isSignedIn]);

  const plan = resolveHealthEmptyPlan({
    appInstalled,
    signedIn: isSignedIn,
    githubLinked,
    isMaintainer,
  });

  const runAction = (action: HealthEmptyAction) => {
    if (action === 'signIn') return onSignIn();
    if (action === 'connectGitHub') return onConnectGitHub();
    if (action === 'snapshot') return onSnapshot();

    // Built at click time rather than as an href: `window` doesn't exist during
    // SSR, and a href that changed after mount would break hydration.
    const returnTo = encodeURIComponent(window.location.pathname);
    window.location.href = `/api/github/install?owner=${encodeURIComponent(
      repo.owner
    )}&returnTo=${returnTo}`;
  };

  const isBusy = (action: HealthEmptyAction | null) =>
    authPending || (action === 'snapshot' && syncing);

  const primaryLabel =
    plan.primary === 'snapshot' && syncing
      ? 'Fetching health data…'
      : plan.primary
      ? ACTION_LABELS[plan.primary]
      : null;

  return (
    <HealthEmptyShell
      title={plan.title}
      tone={plan.tone}
      repo={repo}
      body={plan.body}
      actions={
        plan.primary || plan.secondary ? (
          <>
            {plan.primary && primaryLabel ? (
              <button
                className={styles.oauthActionButton}
                onClick={() => runAction(plan.primary as HealthEmptyAction)}
                disabled={isBusy(plan.primary)}
              >
                <SiGithub size={16} />
                {primaryLabel}
              </button>
            ) : null}

            {plan.secondary ? (
              <button
                className={styles.secondaryAction}
                onClick={() => runAction(plan.secondary as HealthEmptyAction)}
                disabled={isBusy(plan.secondary)}
              >
                {SECONDARY_LABELS[plan.secondary]}
              </button>
            ) : null}
          </>
        ) : null
      }
      footer={
        syncError ? <p className={styles.oauthError}>{syncError}</p> : null
      }
    />
  );
}
