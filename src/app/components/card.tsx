import { PropsWithChildren } from 'react';

export function Card(props: PropsWithChildren) {
  return (
    <div
      style={{
        maxWidth: 'min(1020px, 80vw)',
        margin: '2rem auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: 'var(--nav-dark)',
        color: 'var(--chart-light)',
        borderRadius: '0.5em',
        boxShadow:
          'rgba(50, 50, 93, 0.25) 0px 50px 100px -20px, rgba(0, 0, 0, 0.3) 0px 30px 60px -30px, rgba(10, 37, 64, 0.35) 0px -2px 6px 0px inset',
      }}
    >
      {props.children}
    </div>
  );
}
