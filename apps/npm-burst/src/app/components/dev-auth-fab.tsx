import { useState } from 'react';
import { useHydrated } from 'vike-react/useHydrated';
import {
  useDevAuthOverride,
  type DevAuthOverride,
} from '../context/dev-auth-override-context';
import { useSafeAuth } from '../context/auth-context';
import styles from './dev-auth-fab.module.scss';

const CYCLE: DevAuthOverride[] = [null, 'signedIn', 'signedOut'];

const LABELS: Record<string, string> = {
  null: 'Auth: real',
  signedIn: 'Auth: signed in',
  signedOut: 'Auth: signed out',
};

/**
 * Dev-only control for forcing the signed-in state.
 *
 * Clerk needs a publishable key and a real session, so auth-dependent UI —
 * the health empty state's three variants, the refresh button's blocked
 * modes — is otherwise unreachable locally. This cycles: real → signed in →
 * signed out.
 *
 * The whole component is behind `import.meta.env.DEV`, which Vite replaces
 * with a literal `false` in production, so it is removed at build time.
 *
 * Forcing "signed in" also tags telefunc requests with a dev header, so the
 * Worker runs them as DEV_MODE and they resolve a user instead of 403ing.
 * That means server-derived values (maintainer status, GitHub OAuth) follow
 * the dev fixtures rather than staying false.
 *
 * Page data (`+data`) does NOT see the header — it is a plain navigation, not
 * a telefunc call — so SSR content still comes from the real database.
 */
export function DevAuthFab() {
  const { override, setOverride } = useDevAuthOverride();
  const { isSignedIn } = useSafeAuth();
  const [expanded, setExpanded] = useState(false);
  const hydrated = useHydrated();

  // Client-only: kept out of the SSR tree entirely so it can never contribute
  // to a hydration mismatch, regardless of how `import.meta.env.DEV` resolves
  // in the Worker's SSR environment.
  if (!import.meta.env.DEV || !hydrated) return null;

  const next = CYCLE[(CYCLE.indexOf(override) + 1) % CYCLE.length];

  return (
    <div className={styles.wrapper}>
      {expanded ? (
        <div className={styles.panel}>
          <p className={styles.note}>
            Signed in also tags telefunc calls as DEV_MODE, so they return dev
            fixtures. SSR page data still comes from the real database.
          </p>
          <div className={styles.options}>
            {CYCLE.map((option) => (
              <button
                key={String(option)}
                type="button"
                className={`${styles.option} ${
                  option === override ? styles.optionActive : ''
                }`}
                onClick={() => setOverride(option)}
              >
                {LABELS[String(option)]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.fab}
          onClick={() => setOverride(next)}
          title={`Dev auth override — click to switch to "${
            LABELS[String(next)]
          }"`}
        >
          <span
            className={`${styles.dot} ${
              isSignedIn ? styles.dotOn : styles.dotOff
            }`}
            aria-hidden="true"
          />
          {LABELS[String(override)]}
        </button>
        <button
          type="button"
          className={styles.disclosure}
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label="Dev auth override options"
        >
          {expanded ? '▾' : '▴'}
        </button>
      </div>
    </div>
  );
}
