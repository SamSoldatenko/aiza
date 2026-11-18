import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { safeReturnPath, TokenBroker, type AuthorizationRequest, type CallbackResult, type TokenBrokerDeps } from './tokenBroker'
import { NeedsConsentError, NeedsLoginError } from './errors'
import type { LockFn, MessageChannelLike } from './crossTab'
import type { IdentityConfig } from '@/auth/identity'
import type { OpenIdConfig } from './discovery'
import { decodeJwtPayload } from '@/lib/jwt'

const ISSUER = 'https://idp.example.com/pool'
const TOKEN_ENDPOINT = 'https://auth.example.com/oauth2/token'
const REVOKE_ENDPOINT = 'https://auth.example.com/oauth2/revoke'

const OWNER: IdentityConfig = { issuer: ISSUER, clientId: 'client-a', idpAdapter: 'cognito', scopes: ['openid', 'email'], redirectOrigins: [] }
const OTHER: IdentityConfig = { ...OWNER, clientId: 'client-b' }
// An IdP that may show a consent page for new scopes (Clerk).
const CONSENTING: IdentityConfig = { ...OWNER, clientId: 'client-c', idpAdapter: 'oidc', scopes: ['openid', 'offline_access'] }

const CONFIG: OpenIdConfig = {
  issuer: ISSUER,
  authorization_endpoint: 'https://auth.example.com/oauth2/authorize',
  token_endpoint: TOKEN_ENDPOINT,
  userinfo_endpoint: 'https://auth.example.com/oauth2/userInfo',
  end_session_endpoint: 'https://auth.example.com/logout',
  revocation_endpoint: REVOKE_ENDPOINT,
}

const VAULT: AuthorizationRequest = { scopes: ['vault/read', 'vault/unlock'], services: ['vault'] }
const SYNC: AuthorizationRequest = { scopes: ['sync/read'], services: ['sync'] }

function base64Url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function jwt(payload: Record<string, unknown>): string {
  return `${base64Url('{"alg":"none"}')}.${base64Url(JSON.stringify(payload))}.sig`
}

let issued = 0

// Tokens of one grant; its refresh token names the scopes, so a refresh can
// answer with the same ones (IdPs keep the scopes of the authorization).
function tokens(scope: string, identity = OWNER, extra: Record<string, unknown> = {}, sub = 'user-1') {
  issued++
  return {
    access_token: jwt({ iss: ISSUER, sub, client_id: identity.clientId, scope, n: issued }),
    id_token: jwt({ iss: ISSUER, sub, aud: identity.clientId, email: `${sub}@example.com` }),
    refresh_token: `rt|${identity.clientId}|${scope}`,
    expires_in: 3600,
    token_type: 'Bearer',
    ...extra,
  }
}

// Serializes callbacks per lock name, like navigator.locks shared by all tabs.
function createLock(): LockFn {
  const tails = new Map<string, Promise<unknown>>()
  return (name, fn) => {
    const run = (tails.get(name) ?? Promise.resolve()).then(fn, fn)
    tails.set(name, run.catch(() => undefined))
    return run
  }
}

type Message = Parameters<NonNullable<TokenBrokerDeps['channel']>['post']>[0]

// In-memory BroadcastChannel: delivers to every subscriber except the sender.
function createBus(): (owner: object) => MessageChannelLike<Message> {
  const subscribers = new Set<{ owner: object; listener: (m: Message) => void }>()
  return (owner) => ({
    post: (message) => subscribers.forEach((s) => s.owner !== owner && s.listener(message)),
    subscribe: (listener) => {
      const entry = { owner, listener }
      subscribers.add(entry)
      return () => subscribers.delete(entry)
    },
  })
}

let now = 1_000_000
const sharedLock = createLock()
let bus = createBus()

function makeBroker(overrides: Partial<TokenBrokerDeps> = {}) {
  const navigate = vi.fn()
  const tab = {}
  const broker = new TokenBroker({
    discover: async () => CONFIG,
    redirectUri: () => 'http://localhost:5173/cognito_redirect',
    postLogoutRedirectUri: () => 'http://localhost:5173',
    navigate,
    now: () => now,
    lock: sharedLock,
    channel: bus(tab),
    ...overrides,
  })
  return { broker, navigate }
}

interface IdpCall { endpoint: 'token' | 'revoke'; grantType: string | null; body: URLSearchParams }

// Scope of the last /authorize, answered by the next code exchange.
let authorizedScope = ''
let authorizedSub = 'user-1'

function defaultTokenAnswer(call: IdpCall): Response {
  const clientId = call.body.get('client_id')!
  const identity = [OWNER, OTHER, CONSENTING].find((i) => i.clientId === clientId)!
  if (call.grantType === 'authorization_code') return ok(tokens(authorizedScope, identity, {}, authorizedSub))
  const scope = call.body.get('refresh_token')!.split('|')[2]
  // No rotation, like Cognito: no new refresh token.
  return ok(tokens(scope, identity, { refresh_token: undefined }))
}

function stubIdp(onToken: (call: IdpCall) => Response | Promise<Response> = defaultTokenAnswer): IdpCall[] {
  const calls: IdpCall[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const body = new URLSearchParams(init?.body as URLSearchParams)
    const endpoint = url === TOKEN_ENDPOINT ? 'token' : url === REVOKE_ENDPOINT ? 'revoke' : null
    if (!endpoint) throw new Error(`Unexpected fetch to ${url}`)
    const call = { endpoint, grantType: body.get('grant_type'), body } as const
    calls.push(call)
    return endpoint === 'revoke' ? ok({}) : onToken(call)
  }))
  return calls
}

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response
}

function rejected(): Response {
  return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) } as Response
}

function lastAuthorize(navigate: ReturnType<typeof vi.fn>): URL {
  return new URL(navigate.mock.calls.at(-1)![0] as string)
}

// The IdP sends the browser back for the last /authorize.
async function comeBack(broker: TokenBroker, navigate: ReturnType<typeof vi.fn>, params: { error?: string } = {}): Promise<CallbackResult> {
  const url = lastAuthorize(navigate)
  authorizedScope = url.searchParams.get('scope')!
  const state = url.searchParams.get('state')
  return broker.handleCallback(params.error ? { state, error: params.error } : { code: 'code', state })
}

// Signs in and makes every authorization of the chain.
async function signIn(broker: TokenBroker, navigate: ReturnType<typeof vi.fn>, identity = OWNER, requests: AuthorizationRequest[] = []): Promise<void> {
  await broker.login(identity, { requests, returnTo: '/w/ws1/' })
  let result = await comeBack(broker, navigate)
  // Each step depends on the previous one: sequential on purpose.
  while (result.kind !== 'done') {
    // oxlint-disable-next-line no-await-in-loop
    if (result.kind === 'confirm') await broker.continueAuthorization(result.authorizations)
    // oxlint-disable-next-line no-await-in-loop
    result = await comeBack(broker, navigate)
  }
}

function scopeOf(token: string): string {
  return decodeJwtPayload(token)!.scope as string
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  now = 1_000_000
  bus = createBus()
  authorizedSub = 'user-1'
  stubIdp()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sign-in', () => {
  test('login redirects to the IdP with PKCE, state and the identity\'s scopes', async () => {
    const { broker, navigate } = makeBroker()

    await broker.login(OWNER, { requests: [VAULT], workspaceId: 'ws1', returnTo: '/w/ws1/settings' })

    const url = lastAuthorize(navigate)
    expect(url.origin + url.pathname).toBe(CONFIG.authorization_endpoint)
    expect(url.searchParams.get('client_id')).toBe('client-a')
    expect(url.searchParams.get('scope')).toBe('openid email')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(url.searchParams.get('state')).toBeTruthy()
  })

  test('callback with the matching state stores the session and returns the return path', async () => {
    const { broker, navigate } = makeBroker()
    await broker.login(OWNER, { workspaceId: 'ws1', returnTo: '/w/ws1/settings' })
    const calls = stubIdp()

    const result = await comeBack(broker, navigate)

    expect(result).toEqual({ kind: 'done', returnTo: '/w/ws1/settings', workspaceId: 'ws1' })
    expect(calls).toHaveLength(1)
    expect(calls[0].grantType).toBe('authorization_code')
    expect(calls[0].body.get('code_verifier')).toBeTruthy()
    expect(broker.state(OWNER)).toBe('signed-in')
    expect(broker.claims(OWNER)).toEqual({ sub: 'user-1', email: 'user-1@example.com' })
    expect(broker.canIssue(OWNER, [])).toBe(true)
  })

  test('without a consent page, every service gets its own grant right after sign-in', async () => {
    const { broker, navigate } = makeBroker()
    await broker.login(OWNER, { requests: [VAULT, SYNC], returnTo: '/' })

    expect(await comeBack(broker, navigate)).toEqual({ kind: 'continuing' })
    expect(lastAuthorize(navigate).searchParams.get('scope')).toBe('openid email vault/read vault/unlock')
    expect(await comeBack(broker, navigate)).toEqual({ kind: 'continuing' })
    expect(lastAuthorize(navigate).searchParams.get('scope')).toBe('openid email sync/read')
    expect(await comeBack(broker, navigate)).toMatchObject({ kind: 'done', returnTo: '/' })

    // Each service's token carries its own scopes only.
    expect(scopeOf(await broker.getToken(OWNER, VAULT.scopes))).toBe('openid email vault/read vault/unlock')
    expect(scopeOf(await broker.getToken(OWNER, SYNC.scopes))).toBe('openid email sync/read')
    expect(scopeOf(await broker.getToken(OWNER, []))).toBe('openid email')
  })

  test('services needing the same scopes share one authorization', async () => {
    const { broker, navigate } = makeBroker()
    await broker.login(OWNER, { requests: [VAULT, { scopes: ['vault/unlock', 'vault/read'], services: ['backup'] }], returnTo: '/' })
    await comeBack(broker, navigate)

    expect(navigate).toHaveBeenCalledTimes(2)
    expect(await comeBack(broker, navigate)).toMatchObject({ kind: 'done' })
  })

  test('with a consent page, the app confirms each authorization before sending the user', async () => {
    const { broker, navigate } = makeBroker()
    await broker.login(CONSENTING, { requests: [VAULT, SYNC], returnTo: '/w/ws1/' })

    const first = await comeBack(broker, navigate)
    expect(first).toMatchObject({ kind: 'confirm', authorizations: { next: VAULT, remaining: [SYNC], done: [] } })
    expect(navigate).toHaveBeenCalledTimes(1)

    if (first.kind !== 'confirm') throw new Error('expected confirm')
    await broker.continueAuthorization(first.authorizations)
    expect(lastAuthorize(navigate).searchParams.get('scope')).toBe('openid offline_access vault/read vault/unlock')
    const second = await comeBack(broker, navigate)
    expect(second).toMatchObject({ kind: 'confirm', authorizations: { next: SYNC, remaining: [], done: [VAULT] } })

    expect(broker.canIssue(CONSENTING, VAULT.scopes)).toBe(true)
    expect(broker.canIssue(CONSENTING, SYNC.scopes)).toBe(false)
  })

  test('signed in, login asks only for the grants the session lacks', async () => {
    const { broker, navigate } = makeBroker()
    await signIn(broker, navigate, OWNER, [VAULT])
    navigate.mockClear()

    await broker.login(OWNER, { requests: [VAULT, SYNC], returnTo: '/' })

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(lastAuthorize(navigate).searchParams.get('scope')).toBe('openid email sync/read')
  })

  test('a refused service authorization does not stop the next ones', async () => {
    const { broker, navigate } = makeBroker()
    await broker.login(OWNER, { requests: [VAULT, SYNC], returnTo: '/' })
    await comeBack(broker, navigate)

    expect(await comeBack(broker, navigate, { error: 'invalid_scope' })).toEqual({ kind: 'continuing' })
    expect(await comeBack(broker, navigate)).toMatchObject({ kind: 'done' })
    expect(broker.canIssue(OWNER, VAULT.scopes)).toBe(false)
    expect(broker.canIssue(OWNER, SYNC.scopes)).toBe(true)
  })

  test('a refused sign-in returns to the app with the error and no session', async () => {
    const { broker, navigate } = makeBroker()
    await broker.login(OWNER, { requests: [VAULT], returnTo: '/w/ws1/' })

    expect(await comeBack(broker, navigate, { error: 'access_denied' })).toMatchObject({ kind: 'done', returnTo: '/w/ws1/', error: 'access_denied' })
    expect(broker.state(OWNER)).toBe('signed-out')
  })

  test('a service grant of another user is rejected', async () => {
    const { broker, navigate } = makeBroker()
    await broker.login(OWNER, { requests: [VAULT], returnTo: '/' })
    await comeBack(broker, navigate)
    authorizedSub = 'user-2'

    await expect(comeBack(broker, navigate)).rejects.toThrow(/different user/)
    expect(broker.claims(OWNER)?.sub).toBe('user-1')
    expect(broker.canIssue(OWNER, VAULT.scopes)).toBe(false)
  })

  test.each([
    ['an unknown state', 'forged-state'],
    ['a missing state', null],
  ])('callback with %s is rejected without a token request', async (_name, state) => {
    const { broker } = makeBroker()
    await broker.login(OWNER, { returnTo: '/' })
    const calls = stubIdp()

    await expect(broker.handleCallback({ code: 'auth-code', state })).rejects.toThrow(/state mismatch/i)
    expect(calls).toHaveLength(0)
  })

  test('a pending sign-in can be completed only once', async () => {
    const { broker, navigate } = makeBroker()
    await broker.login(OWNER, { returnTo: '/' })
    const state = lastAuthorize(navigate).searchParams.get('state')

    await broker.handleCallback({ code: 'auth-code', state })
    await expect(broker.handleCallback({ code: 'auth-code', state })).rejects.toThrow(/state mismatch/i)
  })

  test('parallel sign-ins of two identities do not overwrite each other', async () => {
    const { broker, navigate } = makeBroker()
    await broker.login(OWNER, { returnTo: '/a' })
    await broker.login(OTHER, { returnTo: '/b' })
    const [stateA, stateB] = navigate.mock.calls.map((c) => new URL(c[0] as string).searchParams.get('state'))
    authorizedScope = 'openid email'

    expect(await broker.handleCallback({ code: 'code-b', state: stateB })).toMatchObject({ returnTo: '/b' })
    expect(await broker.handleCallback({ code: 'code-a', state: stateA })).toMatchObject({ returnTo: '/a' })
    expect(broker.state(OWNER)).toBe('signed-in')
    expect(broker.state(OTHER)).toBe('signed-in')
  })

  test('abandoned sign-ins expire', async () => {
    const { broker, navigate } = makeBroker()
    await broker.login(OWNER, { returnTo: '/' })
    now += 11 * 60 * 1000

    await expect(comeBack(broker, navigate)).rejects.toThrow(/state mismatch/i)
  })

  test('an ID token issued to another client is rejected', async () => {
    const { broker, navigate } = makeBroker()
    await broker.login(OWNER, { returnTo: '/' })
    stubIdp(() => ok(tokens('openid email', OWNER, { id_token: jwt({ iss: ISSUER, sub: 'user-1', aud: 'someone-else' }) })))

    await expect(comeBack(broker, navigate)).rejects.toThrow(/different identity provider or client/)
    expect(broker.state(OWNER)).toBe('signed-out')
  })

  test('only same-origin paths are accepted as return paths', () => {
    expect(safeReturnPath('/w/x/')).toBe('/w/x/')
    expect(safeReturnPath('//evil.example.com/')).toBe('/')
    expect(safeReturnPath('https://evil.example.com/')).toBe('/')
    expect(safeReturnPath(undefined)).toBe('/')
  })
})

describe('tokens', () => {
  test('a fresh token is returned without contacting the IdP', async () => {
    const { broker, navigate } = makeBroker()
    await signIn(broker, navigate, OWNER, [VAULT])
    const calls = stubIdp()

    expect(await broker.getToken(OWNER, VAULT.scopes)).toContain('.')
    expect(calls).toHaveLength(0)
  })

  test('scopes without a grant raise NeedsConsentError', async () => {
    const { broker, navigate } = makeBroker()
    await signIn(broker, navigate)

    const error = await broker.getToken(OWNER, ['svc/write']).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NeedsConsentError)
    expect((error as NeedsConsentError).missingScopes).toEqual(['svc/write'])
  })

  test('scopes the IdP did not grant raise NeedsConsentError', async () => {
    const { broker, navigate } = makeBroker()
    await broker.login(OWNER, { requests: [VAULT], returnTo: '/' })
    await comeBack(broker, navigate)
    // The IdP leaves out one of the requested scopes.
    stubIdp(() => ok(tokens('openid email vault/read')))
    await comeBack(broker, navigate)

    const error = await broker.getToken(OWNER, VAULT.scopes).catch((e: unknown) => e)
    expect((error as NeedsConsentError).missingScopes).toEqual(['vault/unlock'])
    expect(broker.canIssue(OWNER, VAULT.scopes)).toBe(false)
  })

  test('without a session getToken raises NeedsLoginError', async () => {
    const { broker } = makeBroker()
    await expect(broker.getToken(OWNER, [])).rejects.toBeInstanceOf(NeedsLoginError)
  })

  test('concurrent requests for an expired token share one refresh', async () => {
    const { broker, navigate } = makeBroker()
    await signIn(broker, navigate)
    now += 2 * 3600 * 1000
    const calls = stubIdp()

    const results = await Promise.all([broker.getToken(OWNER, []), broker.getToken(OWNER, []), broker.getToken(OWNER, [])])

    expect(calls).toHaveLength(1)
    expect(calls[0].grantType).toBe('refresh_token')
    expect(new Set(results).size).toBe(1)
    // No rotation: the old refresh token is kept.
    expect(broker.state(OWNER)).toBe('signed-in')
  })

  test('a grant is refreshed with its own refresh token and keeps its scopes', async () => {
    const { broker, navigate } = makeBroker()
    await signIn(broker, navigate, OWNER, [VAULT, SYNC])
    const syncToken = await broker.getToken(OWNER, SYNC.scopes)
    now += 2 * 3600 * 1000
    const calls = stubIdp()

    const vaultToken = await broker.getToken(OWNER, VAULT.scopes)

    expect(calls.map((c) => c.body.get('refresh_token'))).toEqual(['rt|client-a|openid email vault/read vault/unlock'])
    expect(scopeOf(vaultToken)).toBe('openid email vault/read vault/unlock')
    // The other grant was not touched.
    now -= 2 * 3600 * 1000
    expect(await broker.getToken(OWNER, SYNC.scopes)).toBe(syncToken)
  })

  test('two tabs with an expired token make a single refresh request', async () => {
    const tabA = makeBroker()
    const tabB = makeBroker()
    await signIn(tabA.broker, tabA.navigate)
    now += 2 * 3600 * 1000
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const calls = stubIdp(async (call) => {
      await gate
      return defaultTokenAnswer(call)
    })

    const a = tabA.broker.getToken(OWNER, [])
    const b = tabB.broker.getToken(OWNER, [])
    release()

    expect(await a).toBe(await b)
    expect(calls).toHaveLength(1)
  })

  test('a network error during refresh keeps the session', async () => {
    const { broker, navigate } = makeBroker()
    await signIn(broker, navigate)
    now += 2 * 3600 * 1000
    stubIdp(() => { throw new TypeError('Failed to fetch') })

    await expect(broker.getToken(OWNER, [])).rejects.toThrow(TypeError)
    expect(broker.state(OWNER)).toBe('signed-in')
  })

  test('a rejected refresh drops only that grant', async () => {
    const { broker, navigate } = makeBroker()
    await signIn(broker, navigate, OWNER, [VAULT])
    now += 2 * 3600 * 1000
    stubIdp((call) => (call.body.get('refresh_token')!.includes('vault') ? rejected() : defaultTokenAnswer(call)))

    await expect(broker.getToken(OWNER, VAULT.scopes)).rejects.toBeInstanceOf(NeedsConsentError)
    expect(broker.state(OWNER)).toBe('signed-in')
    expect(broker.canIssue(OWNER, VAULT.scopes)).toBe(false)
    expect(await broker.getToken(OWNER, [])).toContain('.')
  })

  test('a rejected refresh of the last grant signs out only that identity', async () => {
    const { broker, navigate } = makeBroker()
    await signIn(broker, navigate, OWNER)
    await signIn(broker, navigate, OTHER)
    now += 2 * 3600 * 1000
    stubIdp(() => rejected())

    await expect(broker.getToken(OWNER, [])).rejects.toBeInstanceOf(NeedsLoginError)
    expect(broker.state(OWNER)).toBe('signed-out')
    expect(broker.claims(OTHER)).not.toBeNull()
    expect(navigate).toHaveBeenCalledTimes(2) // the two sign-ins; no redirect to end_session
  })

  test('an invalidated token is refreshed on the next request', async () => {
    const { broker, navigate } = makeBroker()
    await signIn(broker, navigate)
    const first = await broker.getToken(OWNER, [])
    const calls = stubIdp()

    broker.invalidate(OWNER, first)
    const second = await broker.getToken(OWNER, [])

    expect(calls).toHaveLength(1)
    expect(second).not.toBe(first)
  })

  test('signing out while a refresh is out does not bring the session back', async () => {
    const { broker, navigate } = makeBroker()
    await signIn(broker, navigate)
    now += 2 * 3600 * 1000
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    stubIdp(async (call) => {
      await gate
      return defaultTokenAnswer(call)
    })

    const refresh = broker.getToken(OWNER, [])
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    await broker.forget(OWNER)
    release()

    await expect(refresh).rejects.toBeInstanceOf(NeedsLoginError)
    expect(broker.state(OWNER)).toBe('signed-out')
    expect(localStorage.getItem('aiza:auth:sessions')).toBe('{}')
  })

  test('another user signing in in another tab while a refresh is out is not overwritten', async () => {
    const tabA = makeBroker()
    const tabB = makeBroker()
    await signIn(tabA.broker, tabA.navigate)
    now += 2 * 3600 * 1000
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    stubIdp(async (call) => {
      if (call.grantType === 'refresh_token') await gate
      return defaultTokenAnswer(call)
    })

    const refresh = tabA.broker.getToken(OWNER, [])
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    await tabB.broker.forget(OWNER)
    authorizedSub = 'user-2'
    await signIn(tabB.broker, tabB.navigate)
    expect(tabB.broker.claims(OWNER)?.sub).toBe('user-2')
    release()

    await expect(refresh).rejects.toBeInstanceOf(NeedsLoginError)
    expect(tabA.broker.claims(OWNER)?.sub).toBe('user-2')
  })
})

describe('sign-out and cross-tab sync', () => {
  test('forgetting a session notifies the other tab and revokes its refresh tokens', async () => {
    const tabA = makeBroker()
    const tabB = makeBroker()
    await signIn(tabA.broker, tabA.navigate, OWNER, [VAULT])
    const listener = vi.fn()
    tabB.broker.subscribe(listener)
    const calls = stubIdp()

    await tabA.broker.forget(OWNER)

    expect(listener).toHaveBeenCalled()
    expect(tabB.broker.state(OWNER)).toBe('signed-out')
    expect(calls.filter((c) => c.endpoint === 'revoke').map((c) => c.body.get('token')).toSorted()).toEqual([
      'rt|client-a|openid email',
      'rt|client-a|openid email vault/read vault/unlock',
    ])
  })

  test('endSession revokes the grants and goes to the Cognito logout endpoint', async () => {
    const { broker, navigate } = makeBroker()
    await signIn(broker, navigate)
    const calls = stubIdp()

    await broker.endSession(OWNER)

    expect(calls.map((c) => c.endpoint)).toEqual(['revoke'])
    const url = lastAuthorize(navigate)
    expect(url.origin + url.pathname).toBe(CONFIG.end_session_endpoint)
    expect(url.searchParams.get('client_id')).toBe('client-a')
    expect(url.searchParams.get('logout_uri')).toBe('http://localhost:5173')
    expect(broker.state(OWNER)).toBe('signed-out')
  })
})
