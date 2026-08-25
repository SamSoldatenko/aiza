import { createContext, useContext, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerConfig } from './ServerConfigContext';
import { BackendUserInfo, OAuthUserInfo, TokenRevokedError, fetchCurrentUser, fetchOAuthUserInfo } from './backendClient';
import { getStoredTokens as getStoredTokensRaw, setStoredTokens as setStoredTokensRaw, getPendingAuth, setPendingAuth, clearPendingAuth } from '@/lib/storage';
import { useKeyedState } from '@/lib/useKeyedState';

interface PendingAuth {
  codeVerifier: string;
  tokenEndpoint: string;
  clientId: string;
  state: string;
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

interface AuthContextValue {
  backendUserInfo: BackendUserInfo | null;
  oauthUserInfo: OAuthUserInfo | null;
  getApiAccessToken: () => Promise<string | null>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  handleOAuthCallback: (code: string, state: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const RANDOM_CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const BACKEND_USER_STALE_TIME = 60 * 1000; // 1 minute
const OAUTH_USER_STALE_TIME = 60 * 60 * 1000; // 1 hour

function generateRandomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = '';
  for (let i = 0; i < length; i++) {
    result += RANDOM_CHARSET[bytes[i] % RANDOM_CHARSET.length];
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
  return getStoredTokensRaw<StoredToken>();
}

function setStoredTokens(tokens: StoredToken[]): void {
  setStoredTokensRaw(tokens);
}

function tokenMatchesCredentials(token: StoredToken, issuer: string, clientId: string): boolean {
  const payload = parseJwtPayload(token.access_token);
  return payload.iss === issuer && payload.client_id === clientId;
}

function findTokenIndex(tokens: StoredToken[], issuer: string, clientId: string): number {
  return tokens.findIndex((t) => tokenMatchesCredentials(t, issuer, clientId));
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
  const index = findTokenIndex(tokens, iss, client_id);

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
  const index = findTokenIndex(tokens, iss, client_id);

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

  // Network-level failures (offline, ERR_NETWORK_CHANGED, DNS, etc.) are left to
  // throw so callers can distinguish them from a genuine rejection by Cognito
  // (e.g. 400 invalid_grant) and avoid treating a transient blip as a dead
  // refresh token.
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData,
  });

  if (!response.ok) return null;
  return response.json();
}

const inFlightRefreshes = new Map<string, Promise<TokenResponse | null>>();

// Deduplicates concurrent refresh_token exchanges: callers sharing the same
// token endpoint + client id await a single in-flight request instead of racing.
async function dedupedTokenRefresh(
  tokenEndpoint: string,
  clientId: string,
  refreshToken: string
): Promise<TokenResponse | null> {
  const key = `${tokenEndpoint}:${clientId}`;
  let promise = inFlightRefreshes.get(key);
  if (!promise) {
    promise = performTokenRefresh(tokenEndpoint, clientId, refreshToken).finally(() => {
      inFlightRefreshes.delete(key);
    });
    inFlightRefreshes.set(key, promise);
  }
  return promise;
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

async function fetchAccessToken(
  issuer: string,
  clientId: string,
  tokenEndpoint: string
): Promise<string | null> {
  const token = loadToken(issuer, clientId);
  if (!token) return null;

  if (token.expires_at > Date.now()) return token.access_token;

  const refreshResponse = token.refresh_token
    ? await dedupedTokenRefresh(tokenEndpoint, clientId, token.refresh_token)
    : null;

  const updated = refreshResponse ? updateToken(refreshResponse) : null;
  if (updated) return updated.access_token;

  deleteToken(issuer, clientId);
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactNode {
  const { backendUrl, infoJson, openIdConfig } = useServerConfig();

  const apiService = infoJson?.api;
  const { issuer, token_endpoint, authorization_endpoint, end_session_endpoint, userinfo_endpoint } = openIdConfig ?? {};

  const authKey = issuer && apiService ? `${issuer}::${apiService.client_id}` : null;
  const [isAuthenticated, setIsAuthenticated] = useKeyedState(authKey, () =>
    !!(issuer && apiService && loadToken(issuer, apiService.client_id))
  );

  const login = useCallback(async () => {
    if (!authorization_endpoint || !token_endpoint || !apiService) {
      throw new Error('Backend not configured');
    }

    const codeVerifier = generateRandomString(65);
    const codeChallenge = await sha256AndBase64(codeVerifier);
    const state = generateRandomString(32);

    const pendingAuth: PendingAuth = {
      codeVerifier,
      tokenEndpoint: token_endpoint,
      clientId: apiService.client_id,
      state,
    };
    setPendingAuth(pendingAuth);

    const url = new URL(authorization_endpoint);
    url.searchParams.set('client_id', apiService.client_id);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', apiService.scopes?.join(' ') || 'openid email');
    url.searchParams.set('redirect_uri', getRedirectUri());
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);

    // Navigate the top window, not just the current frame, so the OAuth
    // flow can't be completed inside an iframe if the app is ever embedded.
    window.top!.location.assign(url.toString());
  }, [authorization_endpoint, token_endpoint, apiService]);

  const logout = useCallback(async () => {
    if (!issuer || !apiService) {
      throw new Error('Backend not configured');
    }

    deleteToken(issuer, apiService.client_id);
    setIsAuthenticated(false);

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
  }, [issuer, end_session_endpoint, apiService, setIsAuthenticated]);

  const getApiAccessToken = useCallback(async (): Promise<string | null> => {
    if (!issuer || !apiService || !token_endpoint) return null;
    const token = await fetchAccessToken(issuer, apiService.client_id, token_endpoint);
    setIsAuthenticated(token !== null);
    return token;
  }, [issuer, apiService, token_endpoint, setIsAuthenticated]);

  const handleOAuthCallback = useCallback(async (code: string, state: string | null) => {
    const pendingAuth = getPendingAuth<PendingAuth>();
    if (!pendingAuth) {
      throw new Error('No pending authentication found');
    }

    if (!state || state !== pendingAuth.state) {
      clearPendingAuth();
      throw new Error('OAuth state mismatch: possible CSRF attempt');
    }

    const response = await exchangeAuthCode(
      pendingAuth.tokenEndpoint,
      pendingAuth.clientId,
      code,
      pendingAuth.codeVerifier
    );

    storeToken(response);
    clearPendingAuth();
    setIsAuthenticated(true);
  }, [setIsAuthenticated]);

  const { data: backendUserInfo, error: backendUserError, refetch: refetchBackendUserInfo } = useQuery({
    queryKey: ['backendUserInfo', backendUrl, isAuthenticated],
    queryFn: async () => {
      const token = await getApiAccessToken();
      return token ? fetchCurrentUser(backendUrl!, token) : null;
    },
    enabled: !!backendUrl && isAuthenticated,
    staleTime: BACKEND_USER_STALE_TIME,
  });

  const { data: oauthUserInfo, error: oauthUserError, refetch: refetchOauthUserInfo } = useQuery({
    queryKey: ['oauthUserInfo', userinfo_endpoint, isAuthenticated],
    queryFn: async () => {
      const token = await getApiAccessToken();
      return token ? fetchOAuthUserInfo(userinfo_endpoint!, token) : null;
    },
    enabled: !!userinfo_endpoint && isAuthenticated,
    staleTime: OAUTH_USER_STALE_TIME,
  });

  const tokenRevoked =
    backendUserError instanceof TokenRevokedError ||
    oauthUserError instanceof TokenRevokedError;

  useEffect(() => {
    if (!tokenRevoked || !token_endpoint || !apiService || !issuer) return;

    const token = loadToken(issuer, apiService.client_id);

    const refresh = token?.refresh_token
      ? dedupedTokenRefresh(token_endpoint, apiService.client_id, token.refresh_token)
      : Promise.resolve(null);

    refresh
      .then((refreshResponse) => {
        if (refreshResponse) {
          updateToken(refreshResponse);
          refetchBackendUserInfo();
          refetchOauthUserInfo();
        } else {
          logout();
        }
      })
      .catch((err) => {
        // Network-level failure: refresh token status is unknown, so don't log
        // the user out. A later refetch (e.g. on reconnect) will retry.
        console.error('Token refresh failed:', err);
      });
  }, [tokenRevoked, token_endpoint, apiService, issuer, logout, refetchBackendUserInfo, refetchOauthUserInfo]);

  const value = useMemo<AuthContextValue>(
    () => ({
      backendUserInfo: backendUserInfo ?? null,
      oauthUserInfo: oauthUserInfo ?? null,
      getApiAccessToken,
      login,
      logout,
      handleOAuthCallback,
    }),
    [backendUserInfo, oauthUserInfo, getApiAccessToken, login, logout, handleOAuthCallback]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
