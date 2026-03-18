import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  issueUrl?: string;
}

interface ToastState {
  toasts: Toast[];
  pushToast: (toast: Toast) => void;
  dismissToast: (id: string) => void;
}

export const toastStore = createStore<ToastState>((set) => ({
  toasts: [],
  pushToast: (toast) =>
    set((state) => {
      if (state.toasts.some((existing) => existing.id === toast.id)) {
        return state;
      }
      return { toasts: [...state.toasts, toast] };
    }),
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));

export function useToastStore<T>(selector: (state: ToastState) => T): T {
  return useStore(toastStore, selector);
}
