import { useCallback, useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { Popover } from './popover';
import { useSafeAuth } from '../context/auth-context';
import {
  onGetPackageTrackingStatus,
  onTrackPackage,
  onUntrackPackage,
} from '../../server/functions/tracking.telefunc';
import styles from './track-star.module.scss';

interface TrackStarProps {
  packageName: string;
}

const tooltips: Record<string, string> = {
  none: 'Track this package for daily snapshots',
  others: 'Tracked by others — click to track for yourself',
  mine: "You're tracking this — click to untrack",
};

export function TrackStar({ packageName }: TrackStarProps) {
  const auth = useSafeAuth();
  const [status, setStatus] = useState<'mine' | 'others' | 'none'>('none');
  const [loading, setLoading] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  useEffect(() => {
    setQuotaError(null);
  }, [packageName]);

  useEffect(() => {
    if (!auth.isSignedIn) return;
    let cancelled = false;
    onGetPackageTrackingStatus(packageName)
      .then((res) => {
        if (!cancelled) setStatus(res.status);
      })
      .catch(() => { /* keep status as 'none' */ });
    return () => {
      cancelled = true;
    };
  }, [packageName, auth.isSignedIn]);

  const handleClick = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setQuotaError(null);
    try {
      if (status === 'mine') {
        await onUntrackPackage(packageName);
        setStatus('none');
      } else {
        await onTrackPackage(packageName);
        setStatus('mine');
      }
    } catch (e: unknown) {
      const err = e as { abort?: { reason?: string; message?: string } };
      if (err?.abort?.reason === 'QUOTA_EXCEEDED') {
        setQuotaError(err.abort.message ?? 'Tracking quota exceeded');
      }
    } finally {
      setLoading(false);
    }
  }, [loading, status, packageName]);

  if (!auth.isSignedIn) return null;

  const filled = status === 'mine' || status === 'others';
  const className = [styles.trackStar, status !== 'none' && styles[status]]
    .filter(Boolean)
    .join(' ');

  return (
    <Popover
      content={
        quotaError ? (
          <span style={{ color: 'var(--error-main, #e53935)' }}>{quotaError}</span>
        ) : (
          <span>{tooltips[status]}</span>
        )
      }
      trigger="hover"
    >
      <button
        className={className}
        onClick={handleClick}
        disabled={loading}
        aria-label={tooltips[status]}
      >
        <Star
          size={20}
          fill={filled ? 'currentColor' : 'none'}
          stroke="currentColor"
        />
      </button>
    </Popover>
  );
}
