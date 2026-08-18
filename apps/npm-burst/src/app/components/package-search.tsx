import { Search, Star } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { onGetTrackedPackages } from '../../server/functions/tracking.telefunc';
import { useSafeAuth } from '../context/auth-context';
import styles from './package-search.module.scss';

interface PackageSearchProps {
  onSelectPackage: (pkg: string) => void;
  /** Compact mode for navbar — smaller input, shorter placeholder */
  compact?: boolean;
}

interface NpmSearchResult {
  name: string;
  description: string;
  version: string;
}

interface SearchHandle {
  compact: boolean;
  focus: () => void;
}

/**
 * Cmd/Ctrl+K focuses the search.
 *
 * Registry rather than a listener per component, because pages like
 * package-detail mount two of these at once — the navbar's compact one and a
 * page-level one. Independent listeners would both call `focus()` on the same
 * keystroke and whichever ran last would win, non-deterministically. Instead
 * every instance registers here, one shared listener is attached while any
 * exist, and it picks a single target.
 */
const instances = new Set<SearchHandle>();
let detachShortcut: (() => void) | null = null;

function attachShortcut() {
  if (detachShortcut) return;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== 'k') return;
    if (!event.metaKey && !event.ctrlKey) return;

    // Prefer a page-level search over the navbar's compact one: it is the
    // larger target and, on the pages that have both, the one the page is
    // actually about.
    const target =
      [...instances].find((instance) => !instance.compact) ?? [...instances][0];
    if (!target) return;

    // Only now, so an unhandled Cmd+K still reaches the browser.
    event.preventDefault();
    target.focus();
  };

  document.addEventListener('keydown', onKeyDown);
  detachShortcut = () => document.removeEventListener('keydown', onKeyDown);
}

function isMacPlatform() {
  // `navigator.platform` is deprecated; userAgentData where available, and the
  // UA string otherwise (it carries "Macintosh").
  const { userAgentData } = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  return /mac|iphone|ipad|ipod/i.test(
    userAgentData?.platform ?? navigator.userAgent
  );
}

export function PackageSearch({
  onSelectPackage,
  compact = false,
}: PackageSearchProps) {
  const { isSignedIn } = useSafeAuth();
  const [query, setQuery] = useState('');
  const [npmResults, setNpmResults] = useState<NpmSearchResult[]>([]);
  const [trackedPackages, setTrackedPackages] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [shortcutHint, setShortcutHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Load tracked packages on mount if signed in
  useEffect(() => {
    if (!isSignedIn) return;
    onGetTrackedPackages()
      .then(({ packages }) => setTrackedPackages(packages))
      .catch(() => {
        /* ignore auth errors */
      });
  }, [isSignedIn]);

  // Debounced npm search
  useEffect(() => {
    if (!query.trim()) {
      setNpmResults([]);
      return () => {
        // intentional noop
      };
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(
            query
          )}&size=15`
        );
        const data: {
          objects?: {
            package: { name: string; description?: string; version: string };
          }[];
        } = await res.json();
        setNpmResults(
          (data.objects || []).map((obj) => ({
            name: obj.package.name,
            description: obj.package.description || '',
            version: obj.package.version,
          }))
        );
      } catch {
        setNpmResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query]);

  // Register with the Cmd/Ctrl+K registry above.
  useEffect(() => {
    const handle: SearchHandle = {
      compact,
      focus: () => {
        const input = inputRef.current;
        if (!input) return;
        // `focus()` scrolls the input into view on its own, which matters now
        // that the navbar is not sticky and either search can be off-screen.
        input.focus();
        input.select();
        setIsOpen(true);
      },
    };

    instances.add(handle);
    attachShortcut();

    return () => {
      instances.delete(handle);
      if (instances.size === 0) {
        detachShortcut?.();
        detachShortcut = null;
      }
    };
  }, [compact]);

  // Resolved after mount, never during SSR: the prerendered HTML cannot know
  // the platform, so deciding this at render time would hydrate mismatched.
  // Left null on touch devices, where there is no key to press.
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    setShortcutHint(isMacPlatform() ? '⌘K' : 'Ctrl K');
  }, []);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Build combined results
  const filteredTracked = trackedPackages.filter(
    (pkg) => !query || pkg.toLowerCase().includes(query.toLowerCase())
  );

  // All selectable items for keyboard nav
  const allItems = [
    ...filteredTracked.map((name) => ({ type: 'tracked' as const, name })),
    ...npmResults.map((r) => ({ type: 'npm' as const, ...r })),
  ];

  const handleSelect = useCallback(
    (pkg: string) => {
      setIsOpen(false);
      setQuery('');
      onSelectPackage(pkg);
    },
    [onSelectPackage]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && allItems[highlightIndex]) {
        handleSelect(allItems[highlightIndex].name);
      } else if (query.trim()) {
        handleSelect(query.trim().toLowerCase());
      }
    } else if (e.key === 'Escape') {
      // Blur too, so Cmd+K is reversible with the key you would expect and
      // focus does not sit trapped in a search you just dismissed.
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown =
    isOpen &&
    (filteredTracked.length > 0 || npmResults.length > 0 || isLoading);

  return (
    <div
      className={`${styles.container} ${compact ? styles.compact : ''}`}
      ref={containerRef}
    >
      <div className={styles.inputWrapper}>
        <Search size={compact ? 16 : 20} className={styles.searchIcon} />
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder={
            compact ? 'Search packages...' : 'Search npm packages...'
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {/* Only on the instance the shortcut actually targets — see the
            registry's preference for non-compact — so the badge never
            advertises a key that would focus a different box. */}
        {shortcutHint && !query && !compact && (
          <kbd aria-hidden="true" className={styles.shortcutHint}>
            {shortcutHint}
          </kbd>
        )}
      </div>

      {showDropdown && (
        <div className={styles.dropdown}>
          {filteredTracked.length > 0 && (
            <>
              <div className={styles.sectionHeader}>Your tracked packages</div>
              {filteredTracked.map((name, i) => (
                <button
                  key={`tracked-${name}`}
                  className={`${styles.item} ${styles.tracked} ${
                    highlightIndex === i ? styles.highlighted : ''
                  }`}
                  onClick={() => handleSelect(name)}
                  onMouseEnter={() => setHighlightIndex(i)}
                >
                  <Star
                    size={14}
                    fill="var(--warning-main)"
                    className={styles.trackedStar}
                  />
                  <span className={styles.itemName}>{name}</span>
                </button>
              ))}
            </>
          )}

          {npmResults.length > 0 && (
            <>
              <div className={styles.sectionHeader}>npm packages</div>
              {npmResults.map((result, i) => {
                const idx = filteredTracked.length + i;
                return (
                  <button
                    key={`npm-${result.name}`}
                    className={`${styles.item} ${
                      highlightIndex === idx ? styles.highlighted : ''
                    }`}
                    onClick={() => handleSelect(result.name)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                  >
                    <div className={styles.itemContent}>
                      <span className={styles.itemName}>{result.name}</span>
                      <span className={styles.itemVersion}>
                        v{result.version}
                      </span>
                    </div>
                    {result.description && (
                      <span className={styles.itemDescription}>
                        {result.description}
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}

          {isLoading && <div className={styles.loading}>Searching...</div>}
        </div>
      )}
    </div>
  );
}
