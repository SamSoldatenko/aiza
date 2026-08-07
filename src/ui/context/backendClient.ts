export interface ServiceConfig {
  url: string;
  client_id: string;
  scopes: string[];
}

export interface InfoJson {
  name?: string;
  version?: string;
  web?: string;
  'openid-configuration': string;
  client_id?: string;
  api?: ServiceConfig;
  analytics?: ServiceConfig;
  build_timestamp?: string;
}

export interface OpenIdConfig {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint: string;
}

export interface BackendUserInfo {
  id: string;
  created: string;
  modified: string;
  oauthId: {
    issuer: string;
    subject: string;
  };
}

export interface OAuthUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  phone_number_verified?: boolean;
  name?: string;
  username?: string;
}

export class TokenRevokedError extends Error {
  constructor(message = 'Token has been revoked') {
    super(message);
    this.name = 'TokenRevokedError';
  }
}

export async function fetchOpenIdConfig(url: string): Promise<OpenIdConfig> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cannot load ${url}`);
  }
  return response.json();
}

export async function fetchInfoJson(baseUrl: string): Promise<InfoJson> {
  const response = await fetch(baseUrl + '/info.json');
  if (!response.ok) {
    throw new Error(`Cannot load ${baseUrl}/info.json`);
  }
  return response.json();
}

// Shared by any endpoint that returns null on a missing/forbidden resource
// but treats a 401 as a revoked token (distinct from "not found").
async function fetchAuthorized<T>(url: string, token: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw new TokenRevokedError();
  if (!response.ok) return null;
  return response.json();
}

export function fetchCurrentUser(baseUrl: string, token: string): Promise<BackendUserInfo | null> {
  return fetchAuthorized<BackendUserInfo>(`${baseUrl}/accounts/me`, token);
}

export function fetchOAuthUserInfo(userinfoEndpoint: string, token: string): Promise<OAuthUserInfo | null> {
  return fetchAuthorized<OAuthUserInfo>(userinfoEndpoint, token);
}
