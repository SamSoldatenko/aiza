// Coordination between tabs of the same origin. Both APIs are optional so the
// app degrades to per-tab behavior where they are missing (old browsers, jsdom).

export type LockFn = <T>(name: string, fn: () => Promise<T>) => Promise<T>;

export const webLock: LockFn = (name, fn) => {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks?.request ? locks.request(name, fn) : fn();
};

export interface MessageChannelLike<M> {
  post(message: M): void;
  subscribe(listener: (message: M) => void): () => void;
}

export function broadcastChannel<M>(name: string): MessageChannelLike<M> | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(name);
  return {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel is same-origin and has no targetOrigin
    post: (message) => channel.postMessage(message),
    subscribe: (listener) => {
      const handler = (event: MessageEvent<M>) => listener(event.data);
      channel.addEventListener('message', handler);
      return () => channel.removeEventListener('message', handler);
    },
  };
}
