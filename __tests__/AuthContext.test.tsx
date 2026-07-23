import { expect, test, describe, afterEach, beforeEach, vi } from 'vitest'
import { render, renderHook, act, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/app/ui/context/AuthContext'
import { getStoredTokens, setStoredTokens, setPendingAuth, getPendingAuth } from '@/app/lib/storage'

const ISSUER = 'https://cognito-idp.example.com/test-pool'
const CLIENT_ID = 'test-client-id'
const TOKEN_ENDPOINT = 'https://auth.example.com/oauth2/token'
const USERINFO_ENDPOINT = 'https://auth.example.com/oauth2/userInfo'
const BACKEND_URL = 'https://backend.example.com'

vi.mock('@/app/ui/context/ServerConfigContext', () => ({
  useServerConfig: () => ({
    backendUrl: BACKEND_URL,
    infoJson: { api: { client_id: CLIENT_ID, url: BACKEND_URL, scopes: ['openid', 'email'] } },
    openIdConfig: {
      issuer: ISSUER,
      authorization_endpoint: 'https://auth.example.com/oauth2/authorize',
      token_endpoint: TOKEN_ENDPOINT,
      userinfo_endpoint: USERINFO_ENDPOINT,
      end_session_endpoint: 'https://auth.example.com/logout',
    },
    error: null,
    status: 'ok',
    backendType: 'prod',
    setBackendUrl: vi.fn(),
    theme: 'system',
    setTheme: vi.fn(),
  }),
}))

function base64Json(obj: unknown): string {
  return btoa(JSON.stringify(obj))
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${base64Json({ alg: 'none', typ: 'JWT' })}.${base64Json(payload)}.signature`
}

describe('AuthContext token refresh dedup', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  test('concurrent access token requests only trigger one refresh_token exchange', async () => {
    const expiredAccessToken = makeJwt({ iss: ISSUER, client_id: CLIENT_ID, exp: 0 })
    const refreshedAccessToken = makeJwt({ iss: ISSUER, client_id: CLIENT_ID, exp: 9999999999 })

    setStoredTokens([
      {
        access_token: expiredAccessToken,
        id_token: 'old-id-token',
        refresh_token: 'refresh-token-value',
        expires_in: 3600,
        token_type: 'Bearer',
        expires_at: Date.now() - 1000,
      },
    ])

    const tokenEndpointCalls: unknown[] = []

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === TOKEN_ENDPOINT) {
        tokenEndpointCalls.push(init?.body)
        return {
          ok: true,
          json: async () => ({
            access_token: refreshedAccessToken,
            id_token: 'new-id-token',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
        } as Response
      }

      if (url === `${BACKEND_URL}/accounts/me`) {
        return {
          ok: true,
          json: async () => ({
            id: 'user-1',
            created: '',
            modified: '',
            oauthId: { issuer: ISSUER, subject: 'sub-1' },
          }),
        } as Response
      }

      if (url === USERINFO_ENDPOINT) {
        return { ok: true, json: async () => ({ sub: 'sub-1' }) } as Response
      }

      throw new Error(`Unexpected fetch to ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <div />
        </AuthProvider>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(tokenEndpointCalls.length).toBeGreaterThan(0)
    })

    // Give any duplicate in-flight refresh a chance to fire before asserting.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(tokenEndpointCalls).toHaveLength(1)

    const storedTokens = getStoredTokens<{ access_token: string }>()
    expect(storedTokens[0].access_token).toBe(refreshedAccessToken)
  })

  test('network error during refresh does not delete stored tokens', async () => {
    const expiredAccessToken = makeJwt({ iss: ISSUER, client_id: CLIENT_ID, exp: 0 })

    setStoredTokens([
      {
        access_token: expiredAccessToken,
        id_token: 'old-id-token',
        refresh_token: 'refresh-token-value',
        expires_in: 3600,
        token_type: 'Bearer',
        expires_at: Date.now() - 1000,
      },
    ])

    let tokenEndpointCalls = 0

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === TOKEN_ENDPOINT) {
        tokenEndpointCalls++
        throw new TypeError('Failed to fetch')
      }

      throw new Error(`Unexpected fetch to ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <div />
        </AuthProvider>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(tokenEndpointCalls).toBeGreaterThan(0)
    })

    // Give any pending refresh handling a chance to (wrongly) delete tokens before asserting.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const storedTokens = getStoredTokens<{ refresh_token: string }>()
    expect(storedTokens).toHaveLength(1)
    expect(storedTokens[0].refresh_token).toBe('refresh-token-value')
  })

  test('Cognito rejecting the refresh token (400) still deletes stored tokens', async () => {
    const expiredAccessToken = makeJwt({ iss: ISSUER, client_id: CLIENT_ID, exp: 0 })

    setStoredTokens([
      {
        access_token: expiredAccessToken,
        id_token: 'old-id-token',
        refresh_token: 'refresh-token-value',
        expires_in: 3600,
        token_type: 'Bearer',
        expires_at: Date.now() - 1000,
      },
    ])

    let tokenEndpointCalls = 0

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === TOKEN_ENDPOINT) {
        tokenEndpointCalls++
        return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) } as Response
      }

      throw new Error(`Unexpected fetch to ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <div />
        </AuthProvider>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(tokenEndpointCalls).toBeGreaterThan(0)
    })

    await waitFor(() => {
      expect(getStoredTokens()).toHaveLength(0)
    })
  })
})

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}

describe('AuthContext OAuth state (CSRF) validation', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('login() generates a state, persists it, and includes it in the authorization URL', async () => {
    const assignMock = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign: assignMock })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login()
    })

    const calledUrl = new URL(assignMock.mock.calls[0][0] as string)
    const urlState = calledUrl.searchParams.get('state')
    expect(urlState).toBeTruthy()

    const pendingAuth = getPendingAuth<{ state: string }>()
    expect(pendingAuth?.state).toBe(urlState)
  })

  test('handleOAuthCallback rejects when state does not match pendingAuth', async () => {
    setPendingAuth({
      codeVerifier: 'verifier',
      tokenEndpoint: TOKEN_ENDPOINT,
      clientId: CLIENT_ID,
      state: 'expected-state',
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      act(async () => {
        await result.current.handleOAuthCallback('auth-code', 'wrong-state')
      })
    ).rejects.toThrow(/state mismatch/i)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(getPendingAuth()).toBeNull()
  })

  test('handleOAuthCallback rejects when state param is missing', async () => {
    setPendingAuth({
      codeVerifier: 'verifier',
      tokenEndpoint: TOKEN_ENDPOINT,
      clientId: CLIENT_ID,
      state: 'expected-state',
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      act(async () => {
        await result.current.handleOAuthCallback('auth-code', null)
      })
    ).rejects.toThrow(/state mismatch/i)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(getPendingAuth()).toBeNull()
  })

  test('handleOAuthCallback proceeds to token exchange when state matches', async () => {
    setPendingAuth({
      codeVerifier: 'verifier',
      tokenEndpoint: TOKEN_ENDPOINT,
      clientId: CLIENT_ID,
      state: 'expected-state',
    })
    const accessToken = makeJwt({ iss: ISSUER, client_id: CLIENT_ID, exp: 9999999999 })
    let tokenEndpointCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === TOKEN_ENDPOINT) {
        tokenEndpointCalls++
        return {
          ok: true,
          json: async () => ({
            access_token: accessToken,
            id_token: 'id-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
        } as Response
      }

      // backendUserInfo/oauthUserInfo queries fire once isAuthenticated flips true;
      // not the concern of this test, so just decline gracefully.
      return { ok: false, status: 404, json: async () => ({}) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.handleOAuthCallback('auth-code', 'expected-state')
    })

    expect(tokenEndpointCalls).toBe(1)
    expect(getPendingAuth()).toBeNull()
  })
})
