import { createContext, useContext, type PropsWithChildren } from 'react';
import { usePageContext } from 'vike-react/usePageContext';

/**
 * Single source of truth for client-side dev-mode detection.
 *
 * The authoritative value lives on the server (`env.DEV_MODE === 'true'`)
 * and is injected into Vike's `pageContext` by
 * `+onCreatePageContext.server.ts`, then shipped to the client via
 * `passToClient: ['isDevMode']` in `+config.ts`. The provider below
 * reads that value and re-exposes it through React context so consumers
 * don't need to touch `pageContext` directly.
 *
 * Prerendered HTML carries `isDevMode = false` (set by the server hook
 * when no Hono runtime is attached at build time), so production bundles
 * never accidentally claim dev mode.
 */
const DevModeContext = createContext<boolean>(false);

export function DevModeProvider({ children }: PropsWithChildren) {
  const pageContext = usePageContext();
  return (
    <DevModeContext.Provider value={pageContext.isDevMode ?? false}>
      {children}
    </DevModeContext.Provider>
  );
}

export function useIsDevMode(): boolean {
  return useContext(DevModeContext);
}
