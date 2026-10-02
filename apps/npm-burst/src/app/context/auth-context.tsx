import {
  ClerkProvider,
  useAuth as useClerkAuth,
  useClerk,
  useUser,
} from '@clerk/react';
import { PropsWithChildren } from 'react';
import { useIsDevMode } from './dev-mode-context';
import { useDevAuthOverride } from './dev-auth-override-context';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export function AuthProvider({ children }: PropsWithChildren) {
  if (!CLERK_PUBLISHABLE_KEY) {
    // In pre-render or if key not set, render children without Clerk
    return children;
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      {children}
    </ClerkProvider>
  );
}

/**
 * SSR-safe wrapper around Clerk's useAuth.
 * Returns a default unauthenticated state when ClerkProvider is not available
 * (e.g., during pre-rendering or when VITE_CLERK_PUBLISHABLE_KEY is not set).
 * In dev mode (via `DevModeContext`), returns isSignedIn: true to bypass auth.
 */
export function useSafeAuth(): {
  isSignedIn?: boolean;
  isLoaded?: boolean;
  isAdmin: boolean;
} {
  const isDevMode = useIsDevMode();
  // Called unconditionally, before the early returns below, so hook order
  // stays stable. Compiles away entirely in production builds.
  const { override } = useDevAuthOverride();

  if (import.meta.env.DEV && override !== null) {
    const isSignedIn = override === 'signedIn';
    return { isSignedIn, isLoaded: true, isAdmin: isSignedIn } as const;
  }

  if (isDevMode) {
    return { isSignedIn: true, isLoaded: true, isAdmin: true } as const;
  }
  if (!CLERK_PUBLISHABLE_KEY) {
    return { isSignedIn: false, isLoaded: true, isAdmin: false } as const;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const auth = useClerkAuth();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { user } = useUser();
  const roles = user?.publicMetadata?.role;
  const isAdmin = Array.isArray(roles) && roles.includes('admin');
  return { ...auth, isAdmin };
}

export interface ClerkAccountActions {
  /** Opens Clerk's modal sign-in dialog. */
  openSignIn: () => void;
  /**
   * Adds GitHub as a connected account on the *currently signed-in* user,
   * for people who signed up with another provider. Redirects to GitHub's
   * consent screen and back to the current page.
   */
  linkGitHubAccount: () => Promise<void>;
}

const UNAVAILABLE_ACCOUNT_ACTIONS: ClerkAccountActions = {
  openSignIn: () => undefined,
  linkGitHubAccount: async () => undefined,
};

/**
 * SSR-safe access to the Clerk account actions the health report needs.
 * Falls back to no-ops when ClerkProvider is not mounted (pre-render, or no
 * VITE_CLERK_PUBLISHABLE_KEY), matching `useSafeAuth`'s contract.
 */
export function useSafeClerkActions(): ClerkAccountActions {
  if (!CLERK_PUBLISHABLE_KEY) {
    return UNAVAILABLE_ACCOUNT_ACTIONS;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const clerk = useClerk();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { user } = useUser();

  return {
    openSignIn: () => clerk.openSignIn(),
    linkGitHubAccount: async () => {
      if (!user) return;
      const externalAccount = await user.createExternalAccount({
        strategy: 'oauth_github',
        redirectUrl: window.location.href,
      });
      const redirectUrl =
        externalAccount.verification?.externalVerificationRedirectURL;
      if (redirectUrl) {
        window.location.href = redirectUrl.href;
      }
    },
  };
}
