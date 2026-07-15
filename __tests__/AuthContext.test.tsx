import { expect, test, describe, afterEach, beforeEach, vi } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/app/ui/context/AuthContext'

const ISSUER = 'https://cognito-idp.example.com/test-pool'
const CLIENT_ID = 'test-client-id'
const TOKEN_ENDPOINT = 'https://auth.example.com/oauth2/token'
const USERINFO_ENDPOINT = 'https://auth.example.com/oauth2/userInfo'
const BACKEND_URL = 'https://backend.example.com'

vi.mock('@/app/ui/context/ServerConfigContext', () => ({
  useServerConfig: () => ({
    serverId: 'backend.example.com',
    backendUrl: BACKEND_URL,
    aizaJson: { api: { client_id: CLIENT_ID, url: BACKEND_URL, scopes: ['openid', 'email'] } },
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
    connectTo: vi.fn(),
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

    localStorage.setItem(
      'aiza_tokens',
      JSON.stringify([
        {
          access_token: expiredAccessToken,
          id_token: 'old-id-token',
          refresh_token: 'refresh-token-value',
          expires_in: 3600,
          token_type: 'Bearer',
          expires_at: Date.now() - 1000,
        },
      ])
    )

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

    const storedTokens = JSON.parse(localStorage.getItem('aiza_tokens') || '[]')
    expect(storedTokens[0].access_token).toBe(refreshedAccessToken)
  })

  test('network error during refresh does not delete stored tokens', async () => {
    const expiredAccessToken = makeJwt({ iss: ISSUER, client_id: CLIENT_ID, exp: 0 })

    localStorage.setItem(
      'aiza_tokens',
      JSON.stringify([
        {
          access_token: expiredAccessToken,
          id_token: 'old-id-token',
          refresh_token: 'refresh-token-value',
          expires_in: 3600,
          token_type: 'Bearer',
          expires_at: Date.now() - 1000,
        },
      ])
    )

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

    const storedTokens = JSON.parse(localStorage.getItem('aiza_tokens') || '[]')
    expect(storedTokens).toHaveLength(1)
    expect(storedTokens[0].refresh_token).toBe('refresh-token-value')
  })

  test('Cognito rejecting the refresh token (400) still deletes stored tokens', async () => {
    const expiredAccessToken = makeJwt({ iss: ISSUER, client_id: CLIENT_ID, exp: 0 })

    localStorage.setItem(
      'aiza_tokens',
      JSON.stringify([
        {
          access_token: expiredAccessToken,
          id_token: 'old-id-token',
          refresh_token: 'refresh-token-value',
          expires_in: 3600,
          token_type: 'Bearer',
          expires_at: Date.now() - 1000,
        },
      ])
    )

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
      const storedTokens = JSON.parse(localStorage.getItem('aiza_tokens') || '[]')
      expect(storedTokens).toHaveLength(0)
    })
  })
})
