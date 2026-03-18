export type ExternalDataSource = 'github' | 'npm' | 'clerk';

export interface ExternalDataWarning {
  source: ExternalDataSource;
  operation: string;
  message: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export function logExternalFailure(
  warning: Omit<ExternalDataWarning, 'message'>,
  error: unknown,
  details?: Record<string, unknown>
): ExternalDataWarning {
  const result: ExternalDataWarning = {
    ...warning,
    message: getErrorMessage(error),
  };

  console.error(`[${result.source}] ${result.operation} failed: ${result.message}`, {
    ...details,
    error,
  });

  return result;
}

export async function withExternalFallback<T>(
  warning: Omit<ExternalDataWarning, 'message'>,
  action: () => Promise<T>,
  fallback: T | (() => T),
  details?: Record<string, unknown>
): Promise<{ value: T; warning: ExternalDataWarning | null }> {
  try {
    return { value: await action(), warning: null };
  } catch (error) {
    return {
      value: typeof fallback === 'function' ? (fallback as () => T)() : fallback,
      warning: logExternalFailure(warning, error, details),
    };
  }
}
