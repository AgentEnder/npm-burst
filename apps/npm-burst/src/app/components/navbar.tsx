import { memo } from 'react';
import { Moon, Sun } from 'lucide-react';
import { SiGithub } from '@icons-pack/react-simple-icons';
import { useTheme } from '../context/theme-context';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from '@clerk/clerk-react';
import { TrackedPackagesMenu } from './tracked-packages-menu';
import styles from './navbar.module.scss';

const CLERK_AVAILABLE = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

interface NavbarProps {
  onSelectPackage?: (pkg: string) => void;
}

export const Navbar = memo(function Navbar({ onSelectPackage }: NavbarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className={styles.navbar}>
      <div className={styles.title}>Npm Burst</div>
      <div className={styles.spacer}></div>
      <button
        className={styles.themeToggle}
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
      </button>
      <a
        href="https://github.com/agentender/npm-burst"
        className={styles.navLink}
        aria-label="View source on GitHub"
        title="View source on GitHub"
        target="_blank"
        rel="noopener noreferrer"
      >
        <SiGithub size={16} />
      </a>
      {onSelectPackage && (
        <TrackedPackagesMenu onSelectPackage={onSelectPackage} />
      )}
      {CLERK_AVAILABLE && (
        <div className={styles.authSection}>
          <SignedOut>
            <SignInButton mode="modal">
              <button className={styles.signInButton}>Sign In</button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: styles.avatarBox,
                },
              }}
            />
          </SignedIn>
        </div>
      )}
    </nav>
  );
});
