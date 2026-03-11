import { useCallback, useEffect, useState } from 'react';
import { useSafeAuth } from '../context/auth-context';
import { List, X } from 'lucide-react';
import {
  onGetTrackedPackages,
  onUntrackPackage,
} from '../../server/functions/tracking.telefunc';
import styles from './tracked-packages-menu.module.scss';

interface TrackedPackagesMenuProps {
  onSelectPackage: (pkg: string) => void;
}

export function TrackedPackagesMenu({
  onSelectPackage,
}: TrackedPackagesMenuProps) {
  const { isSignedIn } = useSafeAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [packages, setPackages] = useState<string[]>([]);

  const loadPackages = useCallback(async () => {
    if (!isSignedIn) return;
    const { packages: pkgs } = await onGetTrackedPackages();
    setPackages(pkgs);
  }, [isSignedIn]);

  useEffect(() => {
    if (isOpen) {
      loadPackages();
    }
  }, [isOpen, loadPackages]);

  const handleUntrack = useCallback(
    async (pkg: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await onUntrackPackage(pkg);
      setPackages((prev) => prev.filter((p) => p !== pkg));
    },
    []
  );

  const handleSelect = useCallback(
    (pkg: string) => {
      onSelectPackage(pkg);
      setIsOpen(false);
    },
    [onSelectPackage]
  );

  if (!isSignedIn) return null;

  return (
    <div className={styles.container}>
      <button
        className={styles.menuButton}
        onClick={() => setIsOpen(!isOpen)}
        title="Tracked packages"
      >
        <List size={16} />
      </button>
      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.header}>Tracked Packages</div>
          {packages.length === 0 ? (
            <div className={styles.empty}>No tracked packages yet</div>
          ) : (
            <ul className={styles.list}>
              {packages.map((pkg) => (
                <li
                  key={pkg}
                  className={styles.item}
                  onClick={() => handleSelect(pkg)}
                >
                  <span className={styles.packageName}>{pkg}</span>
                  <button
                    className={styles.removeButton}
                    onClick={(e) => handleUntrack(pkg, e)}
                    title={`Untrack ${pkg}`}
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
