// Sessions of identities in localStorage (`aiza:auth:sessions`), read fresh on
// every access so changes made by other tabs are seen, and change
// notifications for this tab (useSyncExternalStore) and the others
// (BroadcastChannel).

import { identityKey, type IdentityConfig } from './identity';
import { parseSession, type Session } from './session';
import type { MessageChannelLike } from './crossTab';
import { getAuthSessions, setAuthSessions } from '@/lib/storage';

export type SessionMessage = { type: 'changed'; identityKey: string };

export class SessionStore {
  private readonly listeners = new Set<() => void>();
  private versionCounter = 0;

  constructor(private readonly channel: MessageChannelLike<SessionMessage> | null) {
    channel?.subscribe(() => this.notify());
  }

  get version(): number {
    return this.versionCounter;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get(identity: IdentityConfig): Session | null {
    return parseSession(getAuthSessions<unknown>()[identityKey(identity)]);
  }

  put(identity: IdentityConfig, session: Session): void {
    setAuthSessions({ ...getAuthSessions<unknown>(), [identityKey(identity)]: session });
    this.changed(identity);
  }

  // Removes the session and returns it (null when there was none).
  remove(identity: IdentityConfig): Session | null {
    const key = identityKey(identity);
    const { [key]: removed, ...rest } = getAuthSessions<unknown>();
    if (removed === undefined) return null;
    setAuthSessions(rest);
    this.changed(identity);
    return parseSession(removed);
  }

  // Compare-and-set: applies `change` to the current session only if it is
  // still generation `expectedId`. `change` returns the new session, or null
  // to remove it. False when the session ended or was replaced meanwhile.
  update(identity: IdentityConfig, expectedId: string, change: (session: Session) => Session | null): boolean {
    const current = this.get(identity);
    if (!current || current.id !== expectedId) return false;
    const next = change(current);
    if (next) this.put(identity, next);
    else this.remove(identity);
    return true;
  }

  private changed(identity: IdentityConfig): void {
    this.channel?.post({ type: 'changed', identityKey: identityKey(identity) });
    this.notify();
  }

  private notify(): void {
    this.versionCounter++;
    this.listeners.forEach((listener) => listener());
  }
}
