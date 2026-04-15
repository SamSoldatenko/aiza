'use client';

import { createContext, useContext, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerConfig } from './ServerConfigContext';

interface PendingAuth {
  codeVerifier: string;
  tokenEndpoint: string;
  clientId: string;
}

interface TokenResponse {
  id_token: string;
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface TokenExchangeResponse extends TokenResponse {
  refresh_token: string;
}

interface StoredToken extends TokenExchangeResponse {
  expires_at: number;
}

interface BackendUserInfo {
  id: string;
  created: string;
  modified: string;
  oauthId: {
    issuer: string;
    subject: string;
  };
}

interface OAuthUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  phone_number_verified?: boolean;
  name?: string;
  username?: string;
}

interface AuthContextValue {
  backendUserInfo: BackendUserInfo | null;
  oauthUserInfo: OAuthUserInfo | null;
  apiAccessToken: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  handleOAuthCallback: (code: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

class TokenRevokedError extends Error {
  constructor(message = 'Token has been revoked') {
    super(message);
    this.name = 'TokenRevokedError';
  }
}

const RANDOM_CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ACCESS_TOKEN_STALE_TIME = 30 * 1000; // 30 seconds
const ACCESS_TOKEN_REFETCH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const BACKEND_USER_STALE_TIME = 60 * 1000; // 1 minute
const OAUTH_USER_STALE_TIME = 60 * 60 * 1000; // 1 hour

function generateRandomString(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += RANDOM_CHARSET[Math.floor(Math.random() * RANDOM_CHARSET.length)];
  }
  return result;
}

async function sha256AndBase64(input: string): Promise<string> {
  const buffer = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(hashBuffer);
  const binary = String.fromCharCode(...bytes);
  const base64String = btoa(binary);
  return base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseJwtPayload(token: string): { iss: string; exp: number; client_id: string } {
  const parts = token.split('.');
  return JSON.parse(atob(parts[1]));
}

function getStoredTokens(): StoredToken[] {
  if (typeof window === 'undefined') return [];
  return JSON.parse(localStorage.getItem('aiza_tokens') || '[]');
}

function setStoredTokens(tokens: StoredToken[]): void {
  localStorage.setItem('aiza_tokens', JSON.stringify(tokens));
}

function tokenMatchesCredentials(token: StoredToken, issuer: string, clientId: string): boolean {
  const payload = parseJwtPayload(token.access_token);
  return payload.iss === issuer && payload.client_id === clientId;
}

function loadToken(issuer: string, clientId: string): StoredToken | null {
  return getStoredTokens().find((t) => tokenMatchesCredentials(t, issuer, clientId)) ?? null;
}

function storeToken(response: TokenExchangeResponse): StoredToken {
  const storedToken: StoredToken = {
    ...response,
    expires_at: Date.now() + response.expires_in * 1000,
  };

  const { iss, client_id } = parseJwtPayload(response.access_token);
  const tokens = getStoredTokens();
  const index = tokens.findIndex((t) => tokenMatchesCredentials(t, iss, client_id));

  if (index >= 0) {
    tokens[index] = storedToken;
  } else {
    tokens.push(storedToken);
  }

  setStoredTokens(tokens);
  return storedToken;
}

function deleteToken(issuer: string, clientId: string): void {
  const tokens = getStoredTokens().filter((t) => !tokenMatchesCredentials(t, issuer, clientId));
  setStoredTokens(tokens);
}

function updateToken(response: TokenResponse): StoredToken | null {
  const { iss, client_id } = parseJwtPayload(response.access_token);
  const tokens = getStoredTokens();
  const index = tokens.findIndex((t) => tokenMatchesCredentials(t, iss, client_id));

  if (index < 0) return null;

  const updatedToken: StoredToken = {
    ...tokens[index],
    ...response,
    expires_at: Date.now() + response.expires_in * 1000,
  };

  tokens[index] = updatedToken;
  setStoredTokens(tokens);
  return updatedToken;
}

function getRedirectUri(): string {
  return `${location.protocol}//${location.host}/cognito_redirect`;
}

async function performTokenRefresh(
  tokenEndpoint: string,
  clientId: string,
  refreshToken: string
): Promise<TokenResponse | null> {
  const formData = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
    redirect_uri: getRedirectUri(),
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData,
  }).catch((err) => {
    console.error('Token refresh failed:', err);
    return null;
  });

  if (!response?.ok) return null;
  return response.json();
}

async function exchangeAuthCode(
  tokenEndpoint: string,
  clientId: string,
  code: string,
  codeVerifier: string
): Promise<TokenExchangeResponse> {
  const formData = new URLSearchParams({
    redirect_uri: getRedirectUri(),
    client_id: clientId,
    code,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Token exchange failed');
  }

  return response.json();
}

async function fetchBackendUserInfo(
  backendUrl: string,
  accessToken: string
): Promise<BackendUserInfo | null> {
  const response = await fetch(`${backendUrl}/accounts/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401) throw new TokenRevokedError();
  if (!response.ok) return null;
  return response.json();
}

async function fetchOAuthUserInfo(
  userinfoEndpoint: string,
  accessToken: string
): Promise<OAuthUserInfo | null> {
  const response = await fetch(userinfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401) throw new TokenRevokedError();
  if (!response.ok) return null;
  return response.json();
}

async function fetchAccessToken(
  issuer: string,
  clientId: string,
  tokenEndpoint: string
): Promise<string | null> {
  const token = loadToken(issuer, clientId);
  if (!token) return null;

  if (token.expires_at > Date.now()) return token.access_token;

  const refreshResponse = token.refresh_token
    ? await performTokenRefresh(tokenEndpoint, clientId, token.refresh_token)
    : null;

  const updated = refreshResponse ? updateToken(refreshResponse) : null;
  if (updated) return updated.access_token;

  deleteToken(issuer, clientId);
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactNode {
  const { backendUrl, aizaJson, openIdConfig } = useServerConfig();

  const apiService = aizaJson?.api;
  const { issuer, token_endpoint, authorization_endpoint, end_session_endpoint, userinfo_endpoint } = openIdConfig ?? {};

  const login = useCallback(async () => {
    if (!authorization_endpoint || !token_endpoint || !apiService) {
      throw new Error('Backend not configured');
    }

    const codeVerifier = generateRandomString(65);
    const codeChallenge = await sha256AndBase64(codeVerifier);

    const pendingAuth: PendingAuth = {
      codeVerifier,
      tokenEndpoint: token_endpoint,
      clientId: apiService.client_id,
    };
    localStorage.setItem('aiza_pending_auth', JSON.stringify(pendingAuth));

    const url = new URL(authorization_endpoint);
    url.searchParams.set('client_id', apiService.client_id);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', apiService.scopes?.join(' ') || 'openid email');
    url.searchParams.set('redirect_uri', getRedirectUri());
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    location.assign(url.toString());
  }, [authorization_endpoint, token_endpoint, apiService]);

  const logout = useCallback(async () => {
    if (!issuer || !apiService) {
      throw new Error('Backend not configured');
    }

    deleteToken(issuer, apiService.client_id);

    if (end_session_endpoint) {
      const logoutUrl = `${location.protocol}//${location.host}`;
      const url = new URL(end_session_endpoint);
      url.searchParams.set('client_id', apiService.client_id);
      url.searchParams.set('logout_uri', logoutUrl);
      location.assign(url.toString());
    } else {
      // If no end_session_endpoint is available, we can only perform a local logout.
      // Reload the page to clear application state and reflect the new authentication status.
      location.reload();
    }
  }, [issuer, end_session_endpoint, apiService]);

  const { data: apiAccessToken, refetch: refetchAccessToken } = useQuery({
    queryKey: ['apiAccessToken', issuer, apiService?.client_id],
    queryFn: () => fetchAccessToken(issuer!, apiService!.client_id, token_endpoint!),
    enabled: !!issuer && !!apiService && !!token_endpoint,
    staleTime: ACCESS_TOKEN_STALE_TIME,
    refetchInterval: ACCESS_TOKEN_REFETCH_INTERVAL,
  });

  const handleOAuthCallback = useCallback(async (code: string) => {
    const pendingAuthStr = localStorage.getItem('aiza_pending_auth');
    if (!pendingAuthStr) {
      throw new Error('No pending authentication found');
    }

    const pendingAuth: PendingAuth = JSON.parse(pendingAuthStr);

    const response = await exchangeAuthCode(
      pendingAuth.tokenEndpoint,
      pendingAuth.clientId,
      code,
      pendingAuth.codeVerifier
    );

    storeToken(response);
    localStorage.removeItem('aiza_pending_auth');
    refetchAccessToken();
  }, [refetchAccessToken]);

  const { data: backendUserInfo, error: backendUserError } = useQuery({
    queryKey: ['backendUserInfo', backendUrl, apiAccessToken],
    queryFn: () => fetchBackendUserInfo(backendUrl!, apiAccessToken!),
    enabled: !!backendUrl && !!apiAccessToken,
    staleTime: BACKEND_USER_STALE_TIME,
  });

  const { data: oauthUserInfo, error: oauthUserError } = useQuery({
    queryKey: ['oauthUserInfo', userinfo_endpoint, apiAccessToken],
    queryFn: () => fetchOAuthUserInfo(userinfo_endpoint!, apiAccessToken!),
    enabled: !!userinfo_endpoint && !!apiAccessToken,
    staleTime: OAUTH_USER_STALE_TIME,
  });

  const tokenRevoked =
    backendUserError instanceof TokenRevokedError ||
    oauthUserError instanceof TokenRevokedError;

  useEffect(() => {
    if (!tokenRevoked || !token_endpoint || !apiService || !issuer) return;

    const token = loadToken(issuer, apiService.client_id);
    if (!token?.refresh_token) {
      logout();
      return;
    }

    performTokenRefresh(token_endpoint, apiService.client_id, token.refresh_token).then(
      (refreshResponse) => {
        if (refreshResponse) {
          updateToken(refreshResponse);
          refetchAccessToken();
        } else {
          logout();
        }
      }
    );
  }, [tokenRevoked, token_endpoint, apiService, issuer, logout, refetchAccessToken]);

  return (
    <AuthContext.Provider
      value={{
        backendUserInfo: backendUserInfo ?? null,
        oauthUserInfo: oauthUserInfo ?? null,
        apiAccessToken: apiAccessToken ?? null,
        login,
        logout,
        handleOAuthCallback,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
