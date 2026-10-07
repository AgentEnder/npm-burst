import { useSyncExternalStore } from 'react';
import { URL_CHANGE_EVENT } from '../store/url-sync';

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(URL_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(URL_CHANGE_EVENT, onChange);
  };
}

/**
 * The current query string, including the leading `?`. Empty on the server,
 * so links render path-only there and pick up view state after hydration.
 */
export function useCurrentSearch(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => ''
  );
}
