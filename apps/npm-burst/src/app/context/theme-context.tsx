import {
  createContext,
  useContext,
  useEffect,
  useState,
  PropsWithChildren,
} from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

/** Keep in sync with the inline bootstrap in `pages/+Head.tsx`. */
export const THEME_STORAGE_KEY = 'npm-burst-theme';

/**
 * Set on `<html>` for the duration of a user-initiated theme flip so the
 * colour change animates. Absent on page load, so the first paint (already
 * themed by the bootstrap script) never tweens from one theme to the other.
 */
const THEME_TRANSITION_CLASS = 'theme-transition';
const THEME_TRANSITION_MS = 350;

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readAppliedTheme(): Theme | null {
  const applied = document.documentElement.dataset['theme'];
  return applied === 'light' || applied === 'dark' ? applied : null;
}

export function ThemeProvider({ children }: PropsWithChildren) {
  // Server and first client render agree on 'dark' so hydration matches; the
  // real value is read from the attribute the bootstrap script already set.
  // The page itself is never wrong in the meantime — CSS keys off the
  // attribute, not this state — only theme-aware components re-render once.
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const applied = readAppliedTheme();
    if (applied) setTheme(applied);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    const root = document.documentElement;
    root.classList.add(THEME_TRANSITION_CLASS);
    root.dataset['theme'] = next;
    localStorage.setItem(THEME_STORAGE_KEY, next);
    window.setTimeout(
      () => root.classList.remove(THEME_TRANSITION_CLASS),
      THEME_TRANSITION_MS
    );
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
