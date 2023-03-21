import { PropsWithChildren } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGithub } from '@fortawesome/free-brands-svg-icons';

export function Navbar(props: PropsWithChildren) {
  return (
    <div
      style={{
        width: 'calc(100vw-1.5rem)',
        height: '2rem',
        margin: '0 0 1rem 0',
        display: 'flex',
        backgroundColor: 'var(--nav-dark)',
        color: 'var(--fg-light)',
        alignItems: 'center',
        padding: '0.75rem',
        fontWeight: 800,
        fontSize: '1.5rem',
        boxShadow:
          'rgba(50, 50, 93, 0.25) 0px 50px 100px -20px, rgba(0, 0, 0, 0.3) 0px 30px 60px -30px, rgba(10, 37, 64, 0.35) 0px -2px 6px 0px inset',
      }}
    >
      <div>Npm Burst</div>
      <div
        style={{
          flexGrow: 1,
        }}
      ></div>
      <a
        href="https://github.com/agentender/npm-burst"
        style={{
          textDecoration: 'none',
          color: 'var(--fg-light)',
        }}
      >
        <FontAwesomeIcon icon={faGithub}></FontAwesomeIcon>
      </a>
    </div>
  );
}
