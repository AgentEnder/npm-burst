import { useCallback, useEffect, useState } from 'react';
import { useSafeAuth } from '../context/auth-context';
import { Star } from 'lucide-react';
import {
  onTrackPackage,
  onUntrackPackage,
  onIsPackageTracked,
} from '../../server/functions/tracking.telefunc';
import styles from './track-button.module.scss';

interface TrackButtonProps {
  packageName: string;
}

export function TrackButton({ packageName }: TrackButtonProps) {
  const { isSignedIn } = useSafeAuth();
  const [isTracked, setIsTracked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !packageName) return;
    onIsPackageTracked(packageName)
      .then(({ tracked }) => setIsTracked(tracked))
      .catch(() => {});
  }, [isSignedIn, packageName]);

  const handleToggle = useCallback(async () => {
    if (!isSignedIn || isLoading) return;
    setIsLoading(true);
    try {
      if (isTracked) {
        await onUntrackPackage(packageName);
        setIsTracked(false);
      } else {
        await onTrackPackage(packageName);
        setIsTracked(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, isLoading, isTracked, packageName]);

  if (!isSignedIn) return null;

  return (
    <button
      className={`${styles.trackButton} ${isTracked ? styles.tracked : ''}`}
      onClick={handleToggle}
      disabled={isLoading}
      title={
        isTracked ? 'Untrack package' : 'Track package for daily snapshots'
      }
    >
      <Star size={16} fill={isTracked ? 'currentColor' : 'none'} />
      {isTracked ? 'Tracked' : 'Track'}
    </button>
  );
}
