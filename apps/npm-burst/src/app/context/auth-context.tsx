import {
  ClerkProvider,
  useAuth as useClerkAuth,
  useUser,
} from '@clerk/clerk-react';
import { PropsWithChildren } from 'react';
import { useIsDevMode } from './dev-mode-context';

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
