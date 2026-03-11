import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/**
 * Intercepts fetch requests to /_telefunc and adds the Clerk JWT
 * as an Authorization header. Only call this inside a component
 * rendered within ClerkProvider (use TelefuncAuthSetup wrapper).
 */
export function useTelefuncAuth() {
  const { getToken } = useAuth();

  useEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.includes('/_telefunc')) {
        const token = await getToken();
        if (token) {
          init = init || {};
          init.headers = {
            ...init.headers,
            Authorization: `Bearer ${token}`,
          };
        }
      }

      return originalFetch(input, init);
    };

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [getToken]);
}

/**
 * Returns true if Clerk is configured and the auth hook can be used.
 */
export function isClerkAvailable(): boolean {
  return !!CLERK_PUBLISHABLE_KEY;
}
