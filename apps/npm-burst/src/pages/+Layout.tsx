import { PropsWithChildren } from 'react';
import { ThemeProvider } from '../app/context/theme-context';
import { AuthProvider } from '../app/context/auth-context';
import { useTelefuncAuth, isClerkAvailable } from '../app/hooks/use-telefunc-auth';
import '../styles.scss';

function TelefuncAuthSetup({ children }: PropsWithChildren) {
  useTelefuncAuth();
  return <>{children}</>;
}

export default function Layout({ children }: PropsWithChildren) {
  const inner = (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );

  return (
    <AuthProvider>
      {isClerkAvailable() ? (
        <TelefuncAuthSetup>{inner}</TelefuncAuthSetup>
      ) : (
        inner
      )}
    </AuthProvider>
  );
}
