import { useEffect, useRef } from 'react';
import type { ExternalDataWarning } from '../../server/external-data';
import { toastStore } from '../store/toast-store';
import { buildIssueUrl } from '../utils/issue-report';

function buildToastId(scope: string, warning: ExternalDataWarning): string {
  return `${scope}:${warning.source}:${warning.operation}:${warning.message}`;
}

function buildToastMessage(warning: ExternalDataWarning): string {
  return `${warning.source.toUpperCase()}: ${warning.operation} failed. ${warning.message}`;
}

export function useWarningToast(scope: string, warnings: ExternalDataWarning[]) {
  const seenSignatureRef = useRef<string>('');

  useEffect(() => {
    const signature = warnings
      .map((warning) => buildToastId(scope, warning))
      .sort()
      .join('|');

    if (!signature || signature === seenSignatureRef.current) {
      return;
    }

    seenSignatureRef.current = signature;
    for (const warning of warnings) {
      toastStore.getState().pushToast({
        id: buildToastId(scope, warning),
        message: buildToastMessage(warning),
        issueUrl: buildIssueUrl(scope, warning),
      });
    }
  }, [scope, warnings]);
}
