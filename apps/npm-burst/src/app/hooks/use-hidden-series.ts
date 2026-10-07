import { useCallback, useMemo } from 'react';
import { appStore, useAppStore } from '../store';

type HiddenField = 'adoptionHidden' | 'migrationHidden';

const SETTERS = {
  adoptionHidden: 'setAdoptionHidden',
  migrationHidden: 'setMigrationHidden',
} as const;

/**
 * Hidden legend series for one chart, as a `Set`. The store keeps them as a
 * list so they can round-trip through the query string.
 */
export function useHiddenSeries(field: HiddenField) {
  const labels = useAppStore((s) => s[field]);
  const hidden = useMemo(() => new Set(labels), [labels]);

  const setHidden = useCallback(
    (next: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      const state = appStore.getState();
      const resolved =
        typeof next === 'function' ? next(new Set(state[field])) : next;
      state[SETTERS[field]]([...resolved]);
    },
    [field]
  );

  return [hidden, setHidden] as const;
}
