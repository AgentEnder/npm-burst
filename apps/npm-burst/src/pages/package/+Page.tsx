import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card } from '../../app/components/card';
import { PackageSearch } from '../../app/components/package-search';
import { PackageDashboard } from '../../app/package-dashboard';

function hasPackageInHash(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const normalized = raw.startsWith('/') ? raw.slice(1) : raw;
  const qIdx = normalized.indexOf('?');
  const name = qIdx === -1 ? normalized : normalized.slice(0, qIdx);
  return decodeURIComponent(name).trim().length > 0;
}

function PackageMissing() {
  const handleSelect = (pkg: string) => {
    window.location.hash = `#/${encodeURIComponent(pkg)}`;
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

export default function Page() {
  // Start with null (unknown) to avoid hydration mismatch — the server never
  // sees the hash fragment, so we must defer the check to a client-side effect.
  const [hasPackage, setHasPackage] = useState<boolean | null>(null);

  useEffect(() => {
    setHasPackage(hasPackageInHash());
    const onHashChange = () => setHasPackage(hasPackageInHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Render nothing until client-side check completes (matches SSR empty output)
  if (hasPackage === null) {
    return null;
  }

  if (!hasPackage) {
    return <PackageMissing />;
  }

  return <PackageDashboard />;
}
