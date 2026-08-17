import { useAuth } from '@clerk/clerk-react';
import { config } from 'telefunc/client';
import { DEV_AUTH_HEADER, readDevAuthOverride } from '../../dev-auth';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

let _getToken: (() => Promise<string | null>) | null = null;

const originalFetch = globalThis.fetch;

config.fetch = async (input, init) => {
  // Local-only: tells the Worker to treat this call as the dev user, so
  // telefunctions that require auth don't 403 while the mock is on.
  // Compiled out of production builds along with the server-side branch.
  if (import.meta.env.DEV && readDevAuthOverride() === 'signedIn') {
    init = {
      ...init,
      headers: { ...init?.headers, [DEV_AUTH_HEADER]: '1' },
    };
  }

  if (_getToken) {
    const token = await _getToken();
    if (token) {
      init = {
        ...init,
        headers: {
          ...init?.headers,
          Authorization: `Bearer ${token}`,
        },
      };
    }
  }
  return originalFetch(input, init);
};

/**
 * Bridges Clerk auth into telefunc's custom fetch.
 * Updates the token getter during render (not in an effect)
 * so it's available before any child effects fire telefunc calls.
 *
 * Must be rendered inside ClerkProvider (use TelefuncAuthSetup wrapper).
 */
export function useTelefuncAuth() {
  const { getToken } = useAuth();
  _getToken = getToken;
}

/**
 * Returns true if Clerk is configured and the auth hook can be used.
 */
export function isClerkAvailable(): boolean {
  return !!CLERK_PUBLISHABLE_KEY;
}
