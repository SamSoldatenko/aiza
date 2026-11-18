// Sign-in and tokens of identities, independent of React. One broker per tab;
// tabs serialize refreshes through Web Locks and see each other's changes
// through the SessionStore (architecture A2–A6).
//
// A token is requested for a set of scopes (those of one service) and comes
// from the grant of that set: each grant is a separate /authorize, made right
// after sign-in, so a service never receives a token carrying the scopes of
// another one (IdPs don't narrow scopes on refresh).

import { identityKey, type IdentityConfig } from '@/auth/identity';
import { setPendingAuth, sweepPendingAuth, takePendingAuth } from '@/lib/storage';
import { webLock, broadcastChannel, type LockFn, type MessageChannelLike } from './crossTab';
import { fetchOpenIdConfig, type OpenIdConfig } from './discovery';
import { NeedsConsentError, NeedsLoginError } from './errors';
import { idpAdapter } from './idpAdapters';
import { exchangeCode, refreshTokens, revokeToken } from './oidcClient';
import { codeChallengeS256, generateCodeVerifier, randomString } from './pkce';
import {
  grantKey, isSignedIn, isUsable, missingScopes, requestedScopes, scopesOfKey, tokensToGrant,
  type Grant, type IdTokenClaims, type Session,
} from './session';
import { SessionStore, type SessionMessage } from './sessionStore';

export type { IdTokenClaims } from './session';

export type IdentityState = 'signed-out' | 'signed-in';

// Scopes one or more services need, with their names (for the UI only).
export interface AuthorizationRequest {
  scopes: string[];
  services: string[];
}

export interface LoginOptions {
  // Grants to obtain after signing in (or right away, when signed in).
  requests?: AuthorizationRequest[];
  workspaceId?: string;
  returnTo: string;
}

// Authorizations still to make for a session.
export interface PendingAuthorizations {
  identity: IdentityConfig;
  sessionId: string;
  next: AuthorizationRequest;
  remaining: AuthorizationRequest[];
  // Requests already granted in this chain.
  done: AuthorizationRequest[];
  workspaceId?: string;
  returnTo: string;
}

export type CallbackResult =
  // Back to the app. `error`: what the IdP reported instead of a code.
  | { kind: 'done'; returnTo: string; workspaceId?: string; error?: string }
  // The next /authorize is under way (IdP without a consent page).
  | { kind: 'continuing' }
  // The IdP may ask for consent: let the user start the next /authorize
  // (continueAuthorization) or skip the rest.
  | { kind: 'confirm'; authorizations: PendingAuthorizations; claims: IdTokenClaims | null };

export interface CallbackParams {
  code?: string;
  state?: string | null;
  error?: string;
  errorDescription?: string;
}

interface PendingAuth {
  state: string;
  codeVerifier: string;
  identity: IdentityConfig;
  // Scopes sent to /authorize.
  scopes: string[];
  tokenEndpoint: string;
  // Absent for a sign-in (it starts a new session); else the session the
  // grant is added to.
  sessionId?: string;
  // The request this authorization is for; absent for a sign-in.
  request?: AuthorizationRequest;
  remaining: AuthorizationRequest[];
  done: AuthorizationRequest[];
  workspaceId?: string;
  returnTo: string;
  createdAt: number;
}

export interface TokenBrokerDeps {
  discover(identity: IdentityConfig): Promise<OpenIdConfig>;
  redirectUri(): string;
  postLogoutRedirectUri(): string;
  navigate(url: string): void;
  now(): number;
  lock: LockFn;
  channel: MessageChannelLike<SessionMessage> | null;
}

// Access tokens this close to expiry are refreshed before use.
const EXPIRY_SKEW_MS = 30 * 1000;
const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;

export function safeReturnPath(path: unknown): string {
  // Only same-origin absolute paths; '//host' would be protocol-relative.
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

export class TokenBroker {
  private readonly deps: TokenBrokerDeps;
  private readonly sessions: SessionStore;
  private readonly inFlightRefreshes = new Map<string, Promise<Grant>>();

  constructor(deps: TokenBrokerDeps) {
    this.deps = deps;
    this.sessions = new SessionStore(deps.channel);
  }

  // --- State, for React (useSyncExternalStore) ---

  get version(): number {
    return this.sessions.version;
  }

  subscribe = (listener: () => void): (() => void) => this.sessions.subscribe(listener);

  state(identity: IdentityConfig): IdentityState {
    return isSignedIn(this.sessions.get(identity), this.deps.now()) ? 'signed-in' : 'signed-out';
  }

  claims(identity: IdentityConfig): IdTokenClaims | null {
    return this.sessions.get(identity)?.claims ?? null;
  }

  // Whether a token for `scopes` can be had without a new authorization.
  canIssue(identity: IdentityConfig, scopes: readonly string[]): boolean {
    const grant = this.sessions.get(identity)?.grants[grantKey(identity, scopes)];
    return Boolean(grant) && isUsable(grant!, this.deps.now()) && missingScopes(grant!, scopes).length === 0;
  }

  // --- Tokens ---

  // Token for a service needing `scopes`. Throws NeedsLoginError without a
  // session and NeedsConsentError when the session has no grant carrying
  // these scopes; network errors propagate and keep the session.
  async getToken(identity: IdentityConfig, scopes: readonly string[]): Promise<string> {
    const session = this.sessions.get(identity);
    if (!session) throw new NeedsLoginError();
    const key = grantKey(identity, scopes);
    const grant = session.grants[key];
    if (!grant) throw new NeedsConsentError([...scopes]);
    const missing = missingScopes(grant, scopes);
    if (missing.length > 0) throw new NeedsConsentError(missing);
    if (grant.accessToken && this.isFresh(grant)) return grant.accessToken;

    const refreshed = await this.refresh(identity, key);
    return refreshed.accessToken!;
  }

  // After a 401: the service no longer accepts `token`, so don't hand it out again.
  invalidate(identity: IdentityConfig, token: string): void {
    const session = this.sessions.get(identity);
    const key = session && Object.keys(session.grants).find((k) => session.grants[k].accessToken === token);
    if (!session || !key) return;
    this.sessions.update(identity, session.id, (s) =>
      s.grants[key] ? { ...s, grants: { ...s.grants, [key]: { ...s.grants[key], expiresAt: 0 } } } : s);
  }

  private isFresh(grant: Grant): boolean {
    return grant.expiresAt - EXPIRY_SKEW_MS > this.deps.now();
  }

  private refresh(identity: IdentityConfig, key: string): Promise<Grant> {
    const flightKey = `${identityKey(identity)}#${key}`;
    let promise = this.inFlightRefreshes.get(flightKey);
    if (!promise) {
      // One lock per identity, not per grant: an IdP that rotates refresh
      // tokens (Clerk) revokes the whole chain when one is used twice.
      promise = this.deps
        .lock(`aiza:refresh:${identityKey(identity)}`, () => this.refreshLocked(identity, key))
        .finally(() => this.inFlightRefreshes.delete(flightKey));
      this.inFlightRefreshes.set(flightKey, promise);
    }
    return promise;
  }

  private async refreshLocked(identity: IdentityConfig, key: string): Promise<Grant> {
    // Another tab may have refreshed while this one waited for the lock.
    const session = this.sessions.get(identity);
    if (!session) throw new NeedsLoginError();
    const grant = session.grants[key];
    if (!grant) throw new NeedsConsentError(scopesOfKey(key));
    if (grant.accessToken && this.isFresh(grant)) return grant;
    if (!grant.refreshToken) throw this.dropGrant(identity, session, key);

    const config = await this.deps.discover(identity);
    const result = await refreshTokens({
      tokenEndpoint: config.token_endpoint,
      clientId: identity.clientId,
      refreshToken: grant.refreshToken,
    });
    // The IdP rejected the refresh token: only this grant is gone; nothing
    // is ended at the IdP and other grants and identities are untouched.
    if (!result.ok) throw this.dropGrant(identity, session, key);

    const issued = tokensToGrant(identity, result.tokens, grant.scopes, this.deps.now(), session.sub, grant);
    const written = this.sessions.update(identity, session.id, (s) => ({
      ...s,
      ...(issued.claims ? { claims: issued.claims } : {}),
      ...(issued.idToken ? { idToken: issued.idToken } : {}),
      grants: { ...s.grants, [key]: issued.grant },
    }));
    // Signed out, or signed in again, while the request was out: the
    // session these tokens belong to is gone, so they are not stored.
    if (!written) throw new NeedsLoginError('Signed out while refreshing');
    return issued.grant;
  }

  // Removes a grant that can't be refreshed; returns the error to throw.
  private dropGrant(identity: IdentityConfig, session: Session, key: string): Error {
    let remains = false;
    this.sessions.update(identity, session.id, (s) => {
      const { [key]: _dropped, ...grants } = s.grants;
      remains = Object.keys(grants).length > 0;
      return remains ? { ...s, grants } : null;
    });
    return remains ? new NeedsConsentError(scopesOfKey(key)) : new NeedsLoginError('Session expired');
  }

  // --- Sign-in and authorizations ---

  // Signs in (unless signed in) and then obtains the grants of `requests`
  // that the session lacks.
  async login(identity: IdentityConfig, options: LoginOptions): Promise<void> {
    const session = this.sessions.get(identity);
    const signedIn = session !== null && isSignedIn(session, this.deps.now());
    const missing = this.missingRequests(identity, signedIn ? session : null, options.requests ?? []);
    const flow = { done: [], workspaceId: options.workspaceId, returnTo: safeReturnPath(options.returnTo) };
    if (!signedIn) {
      await this.authorize(identity, { ...flow, remaining: missing });
    } else if (missing.length > 0) {
      const [next, ...remaining] = missing;
      await this.authorize(identity, { ...flow, sessionId: session.id, request: next, remaining });
    }
  }

  // Starts the next authorization of a chain (after the user confirmed it).
  async continueAuthorization(authorizations: PendingAuthorizations): Promise<void> {
    const { identity, sessionId, next, remaining, done, workspaceId, returnTo } = authorizations;
    if (this.sessions.get(identity)?.id !== sessionId) throw new NeedsLoginError('The sign-in this authorization belonged to has ended');
    await this.authorize(identity, { sessionId, request: next, remaining, done, workspaceId, returnTo });
  }

  async handleCallback(params: CallbackParams): Promise<CallbackResult> {
    const now = this.deps.now();
    sweepPendingAuth((auth) => {
      const createdAt = (auth as Partial<PendingAuth>).createdAt;
      return typeof createdAt !== 'number' || now - createdAt > PENDING_AUTH_TTL_MS;
    });

    // The flow is looked up by `state`, so an unknown or missing state is the
    // CSRF case: no token request is made.
    const pending = params.state ? takePendingAuth<PendingAuth>(params.state) : null;
    if (!pending) {
      throw new Error('OAuth state mismatch: no pending sign-in for this state (possible CSRF attempt)');
    }
    const { identity } = pending;
    const back = { kind: 'done' as const, returnTo: safeReturnPath(pending.returnTo), workspaceId: pending.workspaceId };

    if (params.error || !params.code) {
      const error = params.errorDescription || params.error || 'No authorization code';
      // A refused service authorization doesn't stop the others.
      if (pending.sessionId && pending.remaining.length > 0) {
        return this.next(identity, pending.sessionId, pending, pending.done);
      }
      return { ...back, error };
    }

    const tokens = await exchangeCode({
      tokenEndpoint: pending.tokenEndpoint,
      clientId: identity.clientId,
      code: params.code,
      codeVerifier: pending.codeVerifier,
      redirectUri: this.deps.redirectUri(),
    });
    const key = grantKey(identity, pending.request?.scopes ?? []);

    let sessionId: string;
    if (!pending.sessionId) {
      // A sign-in always starts a new session (possibly of a different user).
      const issued = tokensToGrant(identity, tokens, pending.scopes, this.deps.now());
      sessionId = randomString(16);
      this.sessions.put(identity, {
        id: sessionId,
        sub: issued.sub,
        claims: issued.claims ?? { sub: issued.sub },
        ...(issued.idToken ? { idToken: issued.idToken } : {}),
        grants: { [key]: issued.grant },
      });
    } else {
      sessionId = pending.sessionId;
      const session = this.sessions.get(identity);
      if (session?.id !== sessionId) throw new NeedsLoginError('The sign-in this authorization belonged to has ended');
      // Same user only: another one may have signed in at the IdP meanwhile.
      const issued = tokensToGrant(identity, tokens, pending.scopes, this.deps.now(), session.sub);
      this.sessions.update(identity, sessionId, (s) => ({ ...s, grants: { ...s.grants, [key]: issued.grant } }));
    }

    const done = pending.request ? [...pending.done, pending.request] : pending.done;
    if (pending.remaining.length === 0) return back;
    return this.next(identity, sessionId, pending, done);
  }

  private async next(identity: IdentityConfig, sessionId: string, pending: PendingAuth, done: AuthorizationRequest[]): Promise<CallbackResult> {
    const [next, ...remaining] = pending.remaining;
    const authorizations: PendingAuthorizations = {
      identity, sessionId, next, remaining, done, workspaceId: pending.workspaceId, returnTo: safeReturnPath(pending.returnTo),
    };
    if (idpAdapter(identity).consentScreen) {
      return { kind: 'confirm', authorizations, claims: this.claims(identity) };
    }
    await this.continueAuthorization(authorizations);
    return { kind: 'continuing' };
  }

  // Requests without a usable grant, one per grant.
  private missingRequests(identity: IdentityConfig, session: Session | null, requests: AuthorizationRequest[]): AuthorizationRequest[] {
    const now = this.deps.now();
    const byKey = new Map<string, AuthorizationRequest>();
    for (const request of requests) {
      const key = grantKey(identity, request.scopes);
      const grant = session?.grants[key];
      if (grant && isUsable(grant, now) && missingScopes(grant, request.scopes).length === 0) continue;
      const known = byKey.get(key);
      byKey.set(key, known ? { ...known, services: [...known.services, ...request.services] } : request);
    }
    // The sign-in grant itself is not a service request.
    byKey.delete(grantKey(identity, []));
    return [...byKey.values()];
  }

  private async authorize(
    identity: IdentityConfig,
    flow: Pick<PendingAuth, 'sessionId' | 'request' | 'remaining' | 'done' | 'workspaceId' | 'returnTo'>,
  ): Promise<void> {
    const config = await this.deps.discover(identity);
    const scopes = requestedScopes(identity, flow.request?.scopes ?? []);
    const state = randomString(32);
    const codeVerifier = generateCodeVerifier();

    const pending: PendingAuth = {
      ...flow,
      state,
      codeVerifier,
      identity,
      scopes,
      tokenEndpoint: config.token_endpoint,
      createdAt: this.deps.now(),
    };
    setPendingAuth(state, pending);

    const url = new URL(config.authorization_endpoint);
    url.searchParams.set('client_id', identity.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('redirect_uri', this.deps.redirectUri());
    url.searchParams.set('code_challenge', await codeChallengeS256(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    this.deps.navigate(url.toString());
  }

  // --- Sign-out ---

  // Forget the session on this device. Its refresh tokens are revoked: they
  // were issued to this device only.
  async forget(identity: IdentityConfig): Promise<void> {
    const session = this.sessions.remove(identity);
    if (session) await this.revokeGrants(identity, session);
  }

  // End the session at the IdP: affects every workspace using this identity.
  async endSession(identity: IdentityConfig): Promise<void> {
    const session = this.sessions.remove(identity);
    let logoutUrl: string | null = null;
    try {
      if (session) await this.revokeGrants(identity, session);
      const config = await this.deps.discover(identity);
      logoutUrl = idpAdapter(identity).logoutUrl(config, identity, session?.idToken, this.deps.postLogoutRedirectUri());
    } catch {
      // IdP unreachable: the local session is gone anyway.
    }
    this.deps.navigate(logoutUrl ?? this.deps.postLogoutRedirectUri());
  }

  // Best effort: an IdP that can't be reached keeps the tokens until they expire.
  private async revokeGrants(identity: IdentityConfig, session: Session): Promise<void> {
    let endpoint: string | undefined;
    try {
      endpoint = (await this.deps.discover(identity)).revocation_endpoint;
    } catch {
      return;
    }
    if (!endpoint) return;
    const toRevoke = [...new Set(Object.values(session.grants).flatMap((g) => (g.refreshToken ? [g.refreshToken] : [])))];
    await Promise.allSettled(toRevoke.map((refreshToken) =>
      revokeToken({ revocationEndpoint: endpoint!, clientId: identity.clientId, refreshToken })));
  }
}

const discoveryCache = new Map<string, Promise<OpenIdConfig>>();

function cachedDiscovery(identity: IdentityConfig): Promise<OpenIdConfig> {
  let promise = discoveryCache.get(identity.issuer);
  if (!promise) {
    promise = fetchOpenIdConfig(identity);
    promise.catch(() => discoveryCache.delete(identity.issuer));
    discoveryCache.set(identity.issuer, promise);
  }
  return promise;
}

export const tokenBroker = new TokenBroker({
  discover: cachedDiscovery,
  redirectUri: () => `${location.origin}/cognito_redirect`,
  postLogoutRedirectUri: () => location.origin,
  // Navigate the top window, not just the current frame, so the OAuth flow
  // can't be completed inside an iframe if the app is ever embedded.
  navigate: (url) => window.top!.location.assign(url),
  now: () => Date.now(),
  lock: webLock,
  channel: broadcastChannel<SessionMessage>('aiza:identities'),
});
