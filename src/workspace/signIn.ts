import { identityKey, type IdentityConfig } from '@/auth/identity';
import { grantKey } from '@/auth/session';
import type { AuthorizationRequest } from '@/auth/tokenBroker';
import type { Workspace } from './Workspace';

// Grants to obtain when signing `identity` in to `workspace`: one per scope
// set of the configured services using it (services needing the same scopes
// share a grant; those needing none use the sign-in's own). Services without
// an address are left out, so the IdP is never asked for scopes of a service
// that doesn't exist yet.
export function authorizationRequests(workspace: Workspace, identity: IdentityConfig): AuthorizationRequest[] {
  const key = identityKey(identity);
  const byGrant = new Map<string, AuthorizationRequest>();
  for (const [name, service] of Object.entries(workspace.services)) {
    if (!service.configured || service.scopes.length === 0 || identityKey(service.identity) !== key) continue;
    const grant = grantKey(identity, service.scopes);
    const known = byGrant.get(grant);
    byGrant.set(grant, known ? { ...known, services: [...known.services, name] } : { scopes: [...service.scopes], services: [name] });
  }
  return [...byGrant.values()];
}

export function primaryIdentity(workspace: Workspace): IdentityConfig | undefined {
  return Object.values(workspace.identities)[0];
}

// Identities of `workspace` that no other workspace on the device uses:
// "sign out of this workspace" forgets exactly these.
export function identitiesOnlyUsedBy(workspace: Workspace, all: Workspace[]): IdentityConfig[] {
  const usedElsewhere = new Set(
    all.filter((w) => w.id !== workspace.id).flatMap((w) => Object.values(w.identities).map(identityKey)),
  );
  return Object.values(workspace.identities).filter((identity) => !usedElsewhere.has(identityKey(identity)));
}

export function otherWorkspacesUsing(identity: IdentityConfig, workspace: Workspace, all: Workspace[]): Workspace[] {
  const key = identityKey(identity);
  return all.filter((w) => w.id !== workspace.id && Object.values(w.identities).some((i) => identityKey(i) === key));
}
