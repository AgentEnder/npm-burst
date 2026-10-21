/**
 * Keeps the address bar and the store in step. The param table itself, and
 * the pure read/write functions, live in `url-params.ts`.
 */

import type { StoreApi } from 'zustand/vanilla';

import type { AppState } from './app-store';
import {
  readStateFromSearch,
  urlStateChanged,
  writeStateToSearch,
  type UrlViewState,
} from './url-params';

/** Check whether the current page is a package page */
export function isPackagePage(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.includes('/package');
}

/** Read query params into partial state for store initialization */
export function readInitialStateFromURL(): Partial<UrlViewState> {
  return readStateFromSearch(
    typeof document === 'undefined' ? '' : document.location.search
  );
}

/** Fired after the query string changes without a navigation. */
export const URL_CHANGE_EVENT = 'npm-burst:urlchange';

/**
 * Push current URL-synced state to the query string, leaving the path (and
 * therefore the package and tab) untouched.
 */
export function pushStateToURL(state: AppState) {
  if (typeof document === 'undefined') return;
  if (!isPackagePage()) return;

  const search = writeStateToSearch(state, window.location.search);
  if (search !== window.location.search) {
    window.history.replaceState(
      window.history.state,
      document.title,
      `${window.location.pathname}${search}`
    );
    window.dispatchEvent(new Event(URL_CHANGE_EVENT));
  }
}

/** Subscribe to store changes and push URL-synced fields */
export function subscribeToURLSync(store: StoreApi<AppState>): () => void {
  return store.subscribe((state, prevState) => {
    if (urlStateChanged(state, prevState)) pushStateToURL(state);
  });
}

/** Listen for back/forward navigation and update store from the query string */
export function listenForURLChanges(store: StoreApi<AppState>): () => void {
  if (typeof window === 'undefined') {
    return () => {
      /* noop */
    };
  }

  const handler = () => {
    if (!isPackagePage()) return;
    store.getState().applyURLState(readInitialStateFromURL());
  };

  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
}
