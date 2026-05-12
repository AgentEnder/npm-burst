import { h2, lines, unorderedList } from 'markdown-factory';
import type { ExternalDataWarning } from '../../server/external-data';

const ISSUE_BASE_URL =
  'https://github.com/agentender/npm-burst/issues/new?labels=bug&title=';

export function buildIssueUrl(
  scope: string,
  warning: ExternalDataWarning
): string {
  const title = `[bug] ${warning.source} failure in ${scope}`;
  const body = lines(
    h2(
      'Summary',
      `A client-visible external data warning was raised in \`${scope}\`.`
    ),
    h2(
      'Warning',
      unorderedList([
        `Source: ${warning.source}`,
        `Operation: ${warning.operation}`,
        `Message: ${warning.message}`,
      ])
    ),
    h2(
      'Client Context',
      unorderedList([
        `Page: ${window.location.href}`,
        `User agent: ${navigator.userAgent}`,
        `Timestamp: ${new Date().toISOString()}`,
      ])
    ),
    h2(
      'Notes',
      unorderedList([
        'This issue was opened from the in-app warning toast.',
        'Sensitive credentials were intentionally omitted.',
      ])
    )
  );

  return `${ISSUE_BASE_URL}${encodeURIComponent(
    title
  )}&body=${encodeURIComponent(body)}`;
}
