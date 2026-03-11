import { ClerkProvider, useAuth as useClerkAuth } from '@clerk/clerk-react';
import { PropsWithChildren } from 'react';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export function AuthProvider({ children }: PropsWithChildren) {
  if (!CLERK_PUBLISHABLE_KEY) {
    // In pre-render or if key not set, render children without Clerk
    return <>{children}</>;
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
 */
export function useSafeAuth() {
  if (!CLERK_PUBLISHABLE_KEY) {
    return { isSignedIn: false, isLoaded: true } as const;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useClerkAuth();
}
