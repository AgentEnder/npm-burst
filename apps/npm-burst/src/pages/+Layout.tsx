import { PropsWithChildren } from 'react';
import { ThemeProvider } from '../app/context/theme-context';
import { AuthProvider } from '../app/context/auth-context';
import '../styles.scss';

export default function Layout({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </AuthProvider>
  );
}
