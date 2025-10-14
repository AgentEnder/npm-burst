import styles from './error-message.module.scss';

interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({
  title = 'Oops! Something went wrong',
  message,
  onRetry,
}: ErrorMessageProps) {
  return (
    <div className={styles.errorContainer}>
      <div className={styles.errorIcon}>
        <span>⚠️</span>
      </div>
      <h2 className={styles.errorTitle}>{title}</h2>
      <p className={styles.errorMessage}>{message}</p>
      {onRetry && (
        <button className={styles.retryButton} onClick={onRetry}>
          Try Again
        </button>
      )}
    </div>
  );
}
