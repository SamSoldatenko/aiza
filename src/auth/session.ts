// The session of an identity on this device, and the pure functions that
// build and read it. No storage, network or clock here: callers pass `now`.
//
// A session is created by signing in. It holds one grant per set of scopes:
// the sign-in itself (the identity's scopes) and one per service scope set,
// each obtained by its own /authorize. A grant's refresh token keeps the
// scopes it was granted with, so a service only ever receives a token
// carrying its own scopes.

import type { IdentityConfig } from './identity';
import type { TokenResponse } from './oidcClient';
import { decodeJwtPayload } from '@/lib/jwt';

export interface IdTokenClaims {
  sub: string;
  email?: string;
  name?: string;
  username?: string;
}

// The result of one authorization (/authorize + code exchange), kept fresh by refresh.
export interface Grant {
  // Scopes the IdP granted (from the access token or the token response).
  scopes: string[];
  refreshToken?: string;
  accessToken?: string;
  // Epoch ms; 0 for an access token the services no longer accept.
  expiresAt: number;
}

export interface Session {
  // Generation of the session: new at every sign-in, kept by refreshes and
  // added grants. A write prepared for one generation is never applied to
  // another (sign-out or another sign-in while a refresh was in flight).
  id: string;
  sub: string;
  claims: IdTokenClaims;
  idToken?: string;
  // By grantKey().
  grants: Record<string, Grant>;
}

// Scopes an authorization for `scopes` asks for: the identity's own first.
export function requestedScopes(identity: IdentityConfig, scopes: readonly string[]): string[] {
  return [...new Set([...identity.scopes, ...scopes])];
}

// Grants are keyed by the set of scopes they were requested with.
export function grantKey(identity: IdentityConfig, scopes: readonly string[]): string {
  return requestedScopes(identity, scopes).toSorted().join(' ');
}

export function scopesOfKey(key: string): string[] {
  return key.split(' ').filter(Boolean);
}

export function isUsable(grant: Grant, now: number): boolean {
  return Boolean(grant.refreshToken) || grant.expiresAt > now;
}

export function isSignedIn(session: Session | null, now: number): boolean {
  return session !== null && Object.values(session.grants).some((grant) => isUsable(grant, now));
}

export function missingScopes(grant: Grant, scopes: readonly string[]): string[] {
  return scopes.filter((scope) => !grant.scopes.includes(scope));
}

// --- Reading stored sessions ---

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseGrant(value: unknown): Grant | null {
  if (typeof value !== 'object' || value === null) return null;
  const g = value as Partial<Grant>;
  if (!isStringArray(g.scopes) || typeof g.expiresAt !== 'number') return null;
  if (g.refreshToken !== undefined && typeof g.refreshToken !== 'string') return null;
  if (g.accessToken !== undefined && typeof g.accessToken !== 'string') return null;
  return g as Grant;
}

// A stored value as a session, or null. Sessions of an older format (one
// access token per audience) are not read: their identity is signed out.
export function parseSession(value: unknown): Session | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Partial<Session>;
  if (typeof s.id !== 'string' || typeof s.sub !== 'string') return null;
  if (typeof s.claims !== 'object' || s.claims === null || typeof s.claims.sub !== 'string') return null;
  if (typeof s.grants !== 'object' || s.grants === null) return null;
  const grants: Record<string, Grant> = {};
  for (const [key, raw] of Object.entries(s.grants)) {
    const grant = parseGrant(raw);
    if (grant) grants[key] = grant;
  }
  return { id: s.id, sub: s.sub, claims: s.claims, ...(s.idToken !== undefined ? { idToken: s.idToken } : {}), grants };
}

// --- From a token response ---

export interface IssuedTokens {
  sub: string;
  // Present when the response carried an ID token.
  claims?: IdTokenClaims;
  idToken?: string;
  grant: Grant;
}

function scopesOf(response: TokenResponse, accessTokenClaims: Record<string, unknown> | null, requested: string[]): string[] {
  const fromToken = accessTokenClaims?.scope;
  const raw = typeof fromToken === 'string' ? fromToken : response.scope;
  return raw ? raw.split(' ').filter(Boolean) : requested;
}

// Checks a token response of `identity` and turns it into a grant. `expectedSub`:
// the user the tokens must belong to (a grant added to a session, a
// refresh); `previous`: the grant being refreshed, whose refresh token is
// kept when the IdP doesn't rotate it.
export function tokensToGrant(
  identity: IdentityConfig,
  tokens: TokenResponse,
  requested: string[],
  now: number,
  expectedSub?: string,
  previous?: Grant,
): IssuedTokens {
  const accessClaims = decodeJwtPayload(tokens.access_token);
  const idClaims = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null;

  if (idClaims) {
    const aud = idClaims.aud;
    const audiences = Array.isArray(aud) ? aud : [aud];
    if (idClaims.iss !== identity.issuer || !audiences.includes(identity.clientId)) {
      throw new Error('ID token was issued for a different identity provider or client');
    }
  }

  const sub = typeof idClaims?.sub === 'string' ? idClaims.sub : typeof accessClaims?.sub === 'string' ? accessClaims.sub : expectedSub;
  if (!sub) throw new Error('Identity provider returned tokens without a subject');
  if (expectedSub !== undefined && sub !== expectedSub) throw new Error('Identity provider returned tokens for a different user');

  const claims: IdTokenClaims | undefined = idClaims
    ? {
        sub,
        ...(typeof idClaims.email === 'string' ? { email: idClaims.email } : {}),
        ...(typeof idClaims.name === 'string' ? { name: idClaims.name } : {}),
        ...(typeof idClaims['cognito:username'] === 'string' ? { username: idClaims['cognito:username'] as string } : {}),
      }
    : undefined;

  // Without rotation the IdP sends no new refresh token: keep the old one.
  const refreshToken = tokens.refresh_token ?? previous?.refreshToken;
  return {
    sub,
    ...(claims ? { claims } : {}),
    ...(tokens.id_token ? { idToken: tokens.id_token } : {}),
    grant: {
      scopes: scopesOf(tokens, accessClaims, requested),
      ...(refreshToken ? { refreshToken } : {}),
      accessToken: tokens.access_token,
      expiresAt: now + tokens.expires_in * 1000,
    },
  };
}
