import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

/**
 * Local-only override for the signed-in state, so auth-dependent UI (the
 * health empty state, the refresh button's three modes) can be exercised
 * without a Clerk session.
 *
 * Gated on `import.meta.env.DEV`, which Vite statically replaces with `false`
 * in production builds — the override, its storage read, and the toggle UI all
 * drop out at build time rather than shipping dead code behind a runtime flag.
 */
import {
  DEV_AUTH_STORAGE_KEY,
  readDevAuthOverride,
  type DevAuthOverride,
} from '../../dev-auth';

export type { DevAuthOverride };

interface DevAuthOverrideValue {
  override: DevAuthOverride;
  setOverride: (next: DevAuthOverride) => void;
}

const DevAuthOverrideContext = createContext<DevAuthOverrideValue>({
  override: null,
  setOverride: () => undefined,
});

export function DevAuthOverrideProvider({ children }: PropsWithChildren) {
  // Starts null so the server and the client's first render agree; the stored
  // value is applied in an effect, after hydration has already matched.
  const [override, setOverrideState] = useState<DevAuthOverride>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    setOverrideState(readDevAuthOverride());
  }, []);

  const setOverride = useCallback((next: DevAuthOverride) => {
    // Guarded so the storage key and writes are dead code in production and
    // drop out with the rest of the override.
    if (!import.meta.env.DEV) return;
    setOverrideState(next);
    try {
      if (next === null) window.localStorage.removeItem(DEV_AUTH_STORAGE_KEY);
      else window.localStorage.setItem(DEV_AUTH_STORAGE_KEY, next);
    } catch {
      /* private browsing / storage disabled — the override just won't persist */
    }
  }, []);

  const value = useMemo(
    () => ({ override, setOverride }),
    [override, setOverride]
  );

  if (!import.meta.env.DEV) return children;

  return (
    <DevAuthOverrideContext.Provider value={value}>
      {children}
    </DevAuthOverrideContext.Provider>
  );
}

export function useDevAuthOverride(): DevAuthOverrideValue {
  return useContext(DevAuthOverrideContext);
}
