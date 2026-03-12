import { PropsWithChildren } from 'react';
import { config } from 'telefunc/client';
import { AuthProvider } from '../context/auth-context';
import { ThemeProvider } from '../context/theme-context';
import {
  isClerkAvailable,
  useTelefuncAuth,
} from '../hooks/use-telefunc-auth';

config.telefuncUrl = `${import.meta.env.BASE_URL}/_telefunc`;

function TelefuncAuthSetup({ children }: PropsWithChildren) {
  useTelefuncAuth();
  return <>{children}</>;
}

/** Shared provider wrapper used by all layouts */
export function Providers({ children }: PropsWithChildren) {
  const inner = <ThemeProvider>{children}</ThemeProvider>;

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
