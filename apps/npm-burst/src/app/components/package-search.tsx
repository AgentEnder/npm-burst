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
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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
      return;
    }

    clearTimeout(debounceRef.current);
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

    return () => clearTimeout(debounceRef.current);
  }, [query]);

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
      setIsOpen(false);
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
                    fill="#f5a623"
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
