import { useSyncExternalStore } from 'react';

function subscribe(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

// Whether the browser thinks it has a network connection. `false` is
// reliable; `true` doesn't promise that any service is reachable.
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
