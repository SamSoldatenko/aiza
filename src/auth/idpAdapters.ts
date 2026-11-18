// Everything IdP-specific lives here (architecture A7).

import type { IdentityConfig, IdpAdapterId } from '@/auth/identity';
import type { OpenIdConfig } from './discovery';

export interface IdpAdapter {
  id: IdpAdapterId;
  // Whether a repeated /authorize for new scopes can show the user a consent
  // page. Without one, the grants of services are obtained silently right
  // after sign-in; with one, the app asks before each of them.
  consentScreen: boolean;
  // URL that ends the session at the IdP, or null if it has no such endpoint.
  logoutUrl(config: OpenIdConfig, identity: IdentityConfig, idToken: string | undefined, postLogoutRedirectUri: string): string | null;
}

// Cognito ignores `scope` on refresh (a refresh token keeps the scopes of its
// /authorize) but answers a repeated /authorize with narrower scopes without
// a login or consent page while its session cookie lives (1 hour). Logout
// takes `logout_uri`, not the standard `post_logout_redirect_uri`.
const cognito: IdpAdapter = {
  id: 'cognito',
  consentScreen: false,
  logoutUrl(config, identity, _idToken, postLogoutRedirectUri) {
    if (!config.end_session_endpoint) return null;
    const url = new URL(config.end_session_endpoint);
    url.searchParams.set('client_id', identity.clientId);
    url.searchParams.set('logout_uri', postLogoutRedirectUri);
    return url.toString();
  },
};

// Generic OpenID Connect provider (RP-Initiated Logout 1.0). May ask the user
// to consent to new scopes (Clerk does).
const oidc: IdpAdapter = {
  id: 'oidc',
  consentScreen: true,
  logoutUrl(config, identity, idToken, postLogoutRedirectUri) {
    if (!config.end_session_endpoint) return null;
    const url = new URL(config.end_session_endpoint);
    url.searchParams.set('client_id', identity.clientId);
    url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
    if (idToken) url.searchParams.set('id_token_hint', idToken);
    return url.toString();
  },
};

const ADAPTERS: Record<IdpAdapterId, IdpAdapter> = { cognito, oidc };

export function idpAdapter(identity: IdentityConfig): IdpAdapter {
  return ADAPTERS[identity.idpAdapter];
}
