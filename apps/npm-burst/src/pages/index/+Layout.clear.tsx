import { PropsWithChildren } from 'react';
import { Providers } from '../../app/components/providers';
import { Navbar } from '../../app/components/navbar';
import '../../styles.scss';

/**
 * Clear layout for the index/landing page.
 * Replaces the root layout — uses a plain navbar with no search bar.
 */
export default function LandingLayout({ children }: PropsWithChildren) {
  return (
    <Providers>
      <Navbar />
      {children}
    </Providers>
  );
}
