/**
 * Shared constants for the local-only signed-in mock.
 *
 * Deliberately dependency-free: imported by both the browser (telefunc's fetch
 * wrapper) and the Worker (request context), so it must pull in neither React
 * nor server modules.
 *
 * Every consumer gates on `import.meta.env.DEV`, which Vite replaces with a
 * literal `false` at build time — in both the client and server bundles. That
 * makes the bypass unreachable in production by construction rather than by
 * configuration: there is no env var or header that can switch it back on,
 * because the branch is not in the shipped code at all.
 */

/** Set by the browser when the dev FAB is forcing a signed-in session. */
export const DEV_AUTH_HEADER = 'x-npm-burst-dev-auth';

/** localStorage key holding the current override. */
export const DEV_AUTH_STORAGE_KEY = 'npm-burst:dev-auth-override';

export type DevAuthOverride = 'signedIn' | 'signedOut' | null;

/** Read the override without React, for the module-scope telefunc fetch hook. */
export function readDevAuthOverride(): DevAuthOverride {
  if (!import.meta.env.DEV) return null;
  try {
    const stored = globalThis.localStorage?.getItem(DEV_AUTH_STORAGE_KEY);
    return stored === 'signedIn' || stored === 'signedOut' ? stored : null;
  } catch {
    return null;
  }
}
