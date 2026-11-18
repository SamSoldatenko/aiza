// What the app needs to know about an identity provider's app client to sign
// in with it. Defined in code (src/workspace/identities.ts), never taken from
// what a backend reports at runtime (architecture T1).

export type IdpAdapterId = 'cognito' | 'oidc';

export interface IdentityConfig {
  issuer: string;
  clientId: string;
  idpAdapter: IdpAdapterId;
  // Scopes requested by every authorization of this identity: at sign-in and
  // added to the scopes of each service (e.g. `openid`, Clerk's `offline_access`).
  scopes: string[];
  // Origins the IdP accepts as redirect URI for this app client: a workspace
  // signing in with it can be used only from these origins.
  redirectOrigins: string[];
}

// An identity is an app client of an issuer: workspaces naming the same pair
// share its session.
export function identityKey(identity: Pick<IdentityConfig, 'issuer' | 'clientId'>): string {
  return `${identity.issuer}|${identity.clientId}`;
}
