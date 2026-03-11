import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar as faStarSolid } from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
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
  const { isSignedIn } = useAuth();
  const [isTracked, setIsTracked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !packageName) return;
    onIsPackageTracked(packageName).then(({ tracked }) =>
      setIsTracked(tracked)
    );
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
      <FontAwesomeIcon icon={isTracked ? faStarSolid : faStarRegular} />
      {isTracked ? 'Tracked' : 'Track'}
    </button>
  );
}
