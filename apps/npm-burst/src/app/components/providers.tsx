import { PropsWithChildren } from 'react';
import { config } from 'telefunc/client';
import { AuthProvider } from '../context/auth-context';
import { DevAuthOverrideProvider } from '../context/dev-auth-override-context';
import { DevModeProvider } from '../context/dev-mode-context';
import { ThemeProvider } from '../context/theme-context';
import { DevAuthFab } from './dev-auth-fab';
import { ToastRegion } from './toast-region';
import { isClerkAvailable, useTelefuncAuth } from '../hooks/use-telefunc-auth';

config.telefuncUrl = `${
  import.meta.env.BASE_URL ? import.meta.env.BASE_URL : '/'
}_telefunc`;

function TelefuncAuthSetup({ children }: PropsWithChildren) {
  useTelefuncAuth();
  return children;
}

/** Shared provider wrapper used by all layouts */
export function Providers({ children }: PropsWithChildren) {
  const inner = (
    <ThemeProvider>
      {children}
      <ToastRegion />
      {import.meta.env.DEV ? <DevAuthFab /> : null}
    </ThemeProvider>
  );

  return (
    <DevModeProvider>
      <DevAuthOverrideProvider>
        <AuthProvider>
          {isClerkAvailable() ? (
            <TelefuncAuthSetup>{inner}</TelefuncAuthSetup>
          ) : (
            inner
          )}
        </AuthProvider>
      </DevAuthOverrideProvider>
    </DevModeProvider>
  );
}
