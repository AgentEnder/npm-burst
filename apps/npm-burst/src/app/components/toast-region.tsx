import { useEffect } from 'react';
import styles from './toast-region.module.scss';
import { useToastStore } from '../store/toast-store';

function ToastItem({
  id,
  message,
  issueUrl,
}: {
  id: string;
  message: string;
  issueUrl?: string;
}) {
  const dismissToast = useToastStore((state) => state.dismissToast);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => dismissToast(id), 7000);
    return () => window.clearTimeout(timeoutId);
  }, [dismissToast, id]);

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <div className={styles.message}>{message}</div>
      <div className={styles.actions}>
        {issueUrl ? (
          <a
            href={issueUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.issueLink}
          >
            Report issue
          </a>
        ) : null}
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => dismissToast(id)}
          aria-label="Dismiss notification"
        >
          x
        </button>
      </div>
    </div>
  );
}

export function ToastRegion() {
  const toasts = useToastStore((state) => state.toasts);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className={styles.region}>
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          message={toast.message}
          issueUrl={toast.issueUrl}
        />
      ))}
    </div>
  );
}
