// Token endpoint calls. A network failure (offline, DNS, ERR_NETWORK_CHANGED)
// is left to throw, so callers can tell it apart from the IdP rejecting the
// request — a transient blip must never be treated as a dead refresh token.

export interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

function isTokenResponse(value: unknown): value is TokenResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<TokenResponse>;
  return typeof v.access_token === 'string' && typeof v.expires_in === 'number';
}

async function postForm(tokenEndpoint: string, form: Record<string, string>): Promise<Response> {
  return fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
}

export async function exchangeCode(params: {
  tokenEndpoint: string;
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const response = await postForm(params.tokenEndpoint, {
    grant_type: 'authorization_code',
    client_id: params.clientId,
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });
  const body: unknown = response.ok ? await response.json() : null;
  if (!isTokenResponse(body)) {
    throw new Error('Token exchange failed');
  }
  return body;
}

export type RefreshResult = { ok: true; tokens: TokenResponse } | { ok: false; reason: 'rejected' };

export async function refreshTokens(params: {
  tokenEndpoint: string;
  clientId: string;
  refreshToken: string;
}): Promise<RefreshResult> {
  const response = await postForm(params.tokenEndpoint, {
    grant_type: 'refresh_token',
    client_id: params.clientId,
    refresh_token: params.refreshToken,
  });
  if (!response.ok) return { ok: false, reason: 'rejected' };
  const body: unknown = await response.json();
  return isTokenResponse(body) ? { ok: true, tokens: body } : { ok: false, reason: 'rejected' };
}

// RFC 7009. Revoking a refresh token also ends the access tokens issued
// from that token (Cognito, Clerk). Resolves to whether the IdP accepted the
// request.
export async function revokeToken(params: { revocationEndpoint: string; clientId: string; refreshToken: string }): Promise<boolean> {
  const response = await postForm(params.revocationEndpoint, {
    token: params.refreshToken,
    token_type_hint: 'refresh_token',
    client_id: params.clientId,
  });
  return response.ok;
}
