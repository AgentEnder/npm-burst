import { PropsWithChildren } from 'react';
import { ThemeProvider } from '../app/context/theme-context';
import '../styles.scss';

export default function Layout({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
