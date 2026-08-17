import { AlertTriangle } from 'lucide-react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Card } from '../../app/components/card';
import { PackageSearch } from '../../app/components/package-search';
import {
  buildLegacyRedirectPath,
  buildPackagePath,
} from '../../app/utils/package-route';

// Layout effects don't run during SSR; React warns if you use one there.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * `/package` with no package named.
 *
 * Deep links (`/package/nx`, `/package/@nx/devkit/health`) are handled by the
 * `package-detail` page, so this is purely the "pick something" state and can
 * stay prerendered — it has no per-request content.
 *
 * It also rescues the retired `/package#/nx` hash URLs. The server never sees
 * a fragment, so those requests land here looking like a bare `/package` and
 * can only be redirected client-side.
 */
export default function Page() {
  const [isRedirecting, setIsRedirecting] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const target = buildLegacyRedirectPath(window.location.hash);
    if (!target) return;

    setIsRedirecting(true);
    // `replace`, not `assign`: the legacy URL should not sit in history where
    // Back would bounce the visitor straight into another redirect.
    window.location.replace(target);
  }, []);

  const handleSelect = (pkg: string) => {
    window.location.href = buildPackagePath(pkg);
  };

  // Runs before paint, so the "no package selected" card never flashes on the
  // way to the canonical URL.
  if (isRedirecting) return null;

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
        <AlertTriangle size={48} color="var(--warning-main, #f5a623)" />
        <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>
          No package selected
        </h2>
        <p
          style={{
            margin: 0,
            color: 'var(--text-secondary)',
            maxWidth: '400px',
          }}
        >
          Search for an npm package below to view its download distribution.
        </p>
        <div style={{ width: '100%', maxWidth: '500px' }}>
          <PackageSearch onSelectPackage={handleSelect} />
        </div>
      </div>
    </Card>
  );
}
