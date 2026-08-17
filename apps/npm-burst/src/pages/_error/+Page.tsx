import { AlertTriangle } from 'lucide-react';
import { usePageContext } from 'vike-react/usePageContext';
import { Card } from '../../app/components/card';
import { PackageSearch } from '../../app/components/package-search';
import { buildPackagePath } from '../../app/utils/package-route';

/**
 * Vike's error page. Without one, an unmatched URL surfaces as a 500 rather
 * than a 404 — which matters here because the package route deliberately
 * declines to match unknown tabs (`/package/nx/bogus`) and bare scopes
 * (`/package/@nx`) so they 404 instead of guessing at a package.
 */
export default function Page() {
  const pageContext = usePageContext();
  const is404 = pageContext.is404 ?? false;

  const handleSelect = (pkg: string) => {
    window.location.href = buildPackagePath(pkg);
  };

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--spacing-lg)',
          padding: 'var(--spacing-xl) var(--spacing-lg)',
          textAlign: 'center',
        }}
      >
        <AlertTriangle
          size={48}
          color={
            is404
              ? 'var(--warning-main, #f5a623)'
              : 'var(--error-main, #e53935)'
          }
        />
        <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>
          {is404 ? 'Page not found' : 'Something went wrong'}
        </h2>
        <p
          style={{
            margin: 0,
            color: 'var(--text-secondary)',
            maxWidth: '420px',
          }}
        >
          {is404
            ? 'That URL does not match a package or view. Search for a package below.'
            : 'An unexpected error occurred while rendering this page. Try again in a moment.'}
        </p>
        {is404 ? (
          <div style={{ width: '100%', maxWidth: '500px' }}>
            <PackageSearch onSelectPackage={handleSelect} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
