import { useSyncExternalStore } from 'react';
import type { IdentityConfig } from '@/auth/identity';
import { tokenBroker, type IdTokenClaims, type IdentityState } from './tokenBroker';

export interface IdentityView {
  state: IdentityState;
  claims: IdTokenClaims | null;
}

// Re-renders whenever any session changes, in this tab or another one.
export function useBrokerVersion(): number {
  return useSyncExternalStore(tokenBroker.subscribe, () => tokenBroker.version);
}

export function useIdentity(identity: IdentityConfig | undefined): IdentityView {
  useBrokerVersion();
  if (!identity) return { state: 'signed-out', claims: null };
  return { state: tokenBroker.state(identity), claims: tokenBroker.claims(identity) };
}

export function displayName(claims: IdTokenClaims | null): string | null {
  return claims ? claims.name || claims.email || claims.username || claims.sub : null;
}
