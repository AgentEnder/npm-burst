import { PropsWithChildren } from 'react';
import { Providers } from '../app/components/providers';
import { Navbar } from '../app/components/navbar';
import '../styles.scss';

function handleSelectPackage(pkg: string) {
  window.location.hash = `#/${encodeURIComponent(pkg)}`;
}

/**
 * Default layout for all pages (except those that clear it).
 * Includes providers + navbar with package search.
 */
export default function Layout({ children }: PropsWithChildren) {
  return (
    <Providers>
      <Navbar onSelectPackage={handleSelectPackage} />
      {children}
    </Providers>
  );
}
