import { useState } from 'react';
import { onRefreshHealthMetricsWithGitHubUserAccess } from '../../server/functions/health.telefunc';
import { useSafeAuth, useSafeClerkActions } from '../context/auth-context';
import { appStore, useAppStore } from '../store';

/**
 * What a click on "refresh" should actually do, given who the visitor is.
 * Only `refresh` performs the fetch; the other two clear the thing blocking it.
 */
export type HealthRefreshAction = 'refresh' | 'signIn' | 'linkGitHub';

/**
 * Pulling a fresh GitHub snapshot for the current package.
 *
 * Shared by the header's refresh control and the empty state's actions — they
 * are never on screen together (one needs snapshots, the other is what shows
 * when there are none), so each can hold its own request state.
 */
export function useHealthRefresh(githubLinked: boolean) {
  const { isSignedIn, isLoaded } = useSafeAuth();
  const { openSignIn, linkGitHubAccount } = useSafeClerkActions();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The report on screen may be a cached copy still being revalidated; a
  // manual refresh would race it (and its GitHub-linked flag may be stale).
  const revalidating = useAppStore((s) => s.isRevalidatingHealth);

  const action: HealthRefreshAction =
    isSignedIn && githubLinked
      ? 'refresh'
      : isSignedIn
      ? 'linkGitHub'
      : 'signIn';

  async function connectGitHub() {
    setError(null);
    try {
      await linkGitHubAccount();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Failed to connect your GitHub account.'
      );
    }
  }

  async function refresh(packageName: string) {
    if (syncing || revalidating) return;
    setSyncing(true);
    setError(null);
    try {
      const refreshed = await onRefreshHealthMetricsWithGitHubUserAccess(
        packageName
      );
      const store = appStore.getState();
      store.setHealth(refreshed);
      store.cacheCurrentPackageData();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Failed to fetch GitHub health data.'
      );
    } finally {
      setSyncing(false);
    }
  }

  /** Routes a click to whichever step is actually blocking the refresh. */
  async function activate(packageName: string) {
    if (action === 'signIn') return openSignIn();
    if (action === 'linkGitHub') return connectGitHub();
    return refresh(packageName);
  }

  return {
    action,
    syncing,
    error,
    /** Clerk hasn't resolved auth yet, so don't let a click guess. */
    authPending: isLoaded === false,
    /** The initial background revalidation of health data is in flight. */
    revalidating,
    activate,
    refresh,
    connectGitHub,
    signIn: openSignIn,
  };
}
