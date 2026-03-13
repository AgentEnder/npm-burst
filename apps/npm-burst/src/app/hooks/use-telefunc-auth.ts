import { useAuth } from '@clerk/clerk-react';
import { config } from 'telefunc/client';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

let _getToken: (() => Promise<string | null>) | null = null;

const originalFetch = globalThis.fetch;

config.fetch = async (input, init) => {
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
