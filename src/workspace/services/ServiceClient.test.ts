import { afterEach, describe, expect, test, vi } from 'vitest'
import { canFailOver, ServiceClient, ServiceRequestError } from './ServiceClient'
import { NeedsConsentError, NeedsLoginError } from '@/auth/errors'
import type { TokenBroker } from '@/auth/tokenBroker'
import type { IdentityConfig } from '@/auth/identity'

const IDENTITY: IdentityConfig = { issuer: 'https://idp.example.com', clientId: 'c', idpAdapter: 'cognito', scopes: [], redirectOrigins: [] }

// Exposes the protected request methods to the tests.
class TestClient extends ServiceClient {
  readonly scopes = ['svc/read']
  protected attemptTimeoutMs = 50

  request(path: string, init?: RequestInit): Promise<Response> {
    return this.fetch(path, init)
  }

  requestJson(path: string): Promise<unknown> {
    return this.fetchJson(path)
  }
}

// Math.random() just below 1 makes the shuffle keep the given order.
function context(urls: string[], tokens: string[] = ['t1', 't2', 't3'], random = 0.999) {
  const queue = [...tokens]
  const broker = {
    getToken: vi.fn(async () => queue.shift()!),
    invalidate: vi.fn(),
  }
  vi.spyOn(Math, 'random').mockReturnValue(random)
  const service = new TestClient(urls, IDENTITY, broker as unknown as TokenBroker)
  return { service, broker }
}

function respond(status: number, body: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

interface Call { url: string; auth: string | null; init: RequestInit }

function stubFetch(handler: (url: string, auth: string | null, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = input.toString()
    const auth = new Headers(init.headers).get('Authorization')
    calls.push({ url, auth, init })
    return handler(url, auth, init)
  }))
  return calls
}

// A fetch that never answers on its own: settles only when its signal aborts.
function hang(init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal!.reason))
  })
}

const host = (url: string) => new URL(url).host

describe('ServiceClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('sends a token for the scopes of its class', async () => {
    const { service, broker } = context(['https://a.example.com/'])
    const calls = stubFetch(() => respond(200))

    await service.request('/status')

    expect(broker.getToken).toHaveBeenCalledWith(IDENTITY, ['svc/read'])
    expect(calls.map(({ url, auth }) => ({ url, auth }))).toEqual([{ url: 'https://a.example.com/status', auth: 'Bearer t1' }])
  })

  test('keeps the caller\'s headers, whatever their form', async () => {
    const { service } = context(['https://a.example.com'])
    const calls = stubFetch(() => respond(200))

    await service.request('/x', { headers: new Headers({ 'X-Trace': '1' }) })
    await service.request('/x', { headers: [['X-Trace', '2']] })

    expect(calls.map((c) => new Headers(c.init.headers).get('X-Trace'))).toEqual(['1', '2'])
    expect(calls.every((c) => c.auth === 'Bearer t1' || c.auth === 'Bearer t2')).toBe(true)
  })

  test('fails over to the next endpoint on 5xx and network errors', async () => {
    const { service } = context(['https://a.example.com', 'https://b.example.com', 'https://c.example.com'])
    const calls = stubFetch((url) => {
      if (url.startsWith('https://a.')) return respond(503)
      if (url.startsWith('https://b.')) throw new TypeError('Failed to fetch')
      return respond(200)
    })

    const response = await service.request('/status')

    expect(response.status).toBe(200)
    expect(calls.map((c) => host(c.url))).toEqual(['a.example.com', 'b.example.com', 'c.example.com'])
  })

  test('does not fail over on 4xx', async () => {
    const { service } = context(['https://a.example.com', 'https://b.example.com'])
    const calls = stubFetch(() => respond(403))

    const error = await service.request('/status').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ServiceRequestError)
    expect((error as ServiceRequestError).kind).toBe('forbidden')
    expect(calls).toHaveLength(1)
  })

  test('reports unreachable when every endpoint fails', async () => {
    const { service } = context(['https://a.example.com', 'https://b.example.com'])
    stubFetch(() => respond(502))

    await expect(service.request('/status')).rejects.toMatchObject({ kind: 'network' })
  })

  test('on 401 invalidates the token and retries once with a fresh one', async () => {
    const { service, broker } = context(['https://a.example.com'])
    const calls = stubFetch((_url, auth) => respond(auth === 'Bearer t1' ? 401 : 200))

    const response = await service.request('/status')

    expect(response.status).toBe(200)
    expect(broker.invalidate).toHaveBeenCalledWith(IDENTITY, 't1')
    expect(calls.map((c) => c.auth)).toEqual(['Bearer t1', 'Bearer t2'])
  })

  test('a second 401 is reported as unauthorized for this connection', async () => {
    const { service } = context(['https://a.example.com'])
    stubFetch(() => respond(401))

    await expect(service.request('/status')).rejects.toMatchObject({ kind: 'unauthorized' })
  })

  test('a missing sign-in is reported as needs-login without calling the service', async () => {
    const { service, broker } = context(['https://a.example.com'])
    broker.getToken.mockRejectedValueOnce(new NeedsLoginError())
    const calls = stubFetch(() => respond(200))

    await expect(service.request('/status')).rejects.toMatchObject({ kind: 'needs-login' })
    expect(calls).toHaveLength(0)
  })

  test('an unreachable identity provider is a network failure', async () => {
    const { service, broker } = context(['https://a.example.com'])
    broker.getToken.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    stubFetch(() => respond(200))

    await expect(service.request('/status')).rejects.toMatchObject({ kind: 'network' })
  })

  test('missing consent is reported without calling the service', async () => {
    const { service, broker } = context(['https://a.example.com'])
    broker.getToken.mockRejectedValueOnce(new NeedsConsentError(['svc/read']))
    const calls = stubFetch(() => respond(200))

    await expect(service.request('/status')).rejects.toMatchObject({ kind: 'needs-consent' })
    expect(calls).toHaveLength(0)
  })

  test('fetchJson rejects non-2xx answers', async () => {
    const { service } = context(['https://a.example.com'])
    stubFetch(() => respond(404))

    await expect(service.requestJson('/x')).rejects.toMatchObject({ kind: 'error' })
  })

  test('a service without an address fails without asking for a token', async () => {
    const { service, broker } = context([])
    const calls = stubFetch(() => respond(200))

    expect(service.configured).toBe(false)
    await expect(service.request('/status')).rejects.toMatchObject({ kind: 'unconfigured' })
    expect(broker.getToken).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  test('shuffles the endpoints and starts at the first of its order', async () => {
    const urls = ['https://a.example.com', 'https://b.example.com', 'https://c.example.com']
    const { service } = context(urls, undefined, 0)
    const calls = stubFetch(() => respond(200))

    await service.request('/status')

    expect(service.endpoints).toEqual(['https://b.example.com', 'https://c.example.com', 'https://a.example.com'])
    expect(urls).toEqual(['https://a.example.com', 'https://b.example.com', 'https://c.example.com'])
    expect(service.endpoint).toBe('https://b.example.com')
    expect(host(calls[0].url)).toBe('b.example.com')
  })

  test('sticks to the endpoint that answered', async () => {
    const { service } = context(['https://a.example.com', 'https://b.example.com'])
    let aDown = true
    const calls = stubFetch((url) => (url.startsWith('https://a.') && aDown ? respond(503) : respond(200)))

    await service.request('/status')
    aDown = false
    await service.request('/status')

    expect(service.endpoint).toBe('https://b.example.com')
    expect(calls.map((c) => host(c.url))).toEqual(['a.example.com', 'b.example.com', 'b.example.com'])
  })

  test('fails over round the ring from the current endpoint', async () => {
    const { service } = context(['https://a.example.com', 'https://b.example.com', 'https://c.example.com'])
    let down = ['a', 'b']
    const calls = stubFetch((url) => (down.some((d) => url.startsWith(`https://${d}.`)) ? respond(503) : respond(200)))

    await service.request('/status')
    down = ['c']
    await service.request('/status')

    expect(service.endpoint).toBe('https://a.example.com')
    expect(calls.map((c) => host(c.url))).toEqual(['a.example.com', 'b.example.com', 'c.example.com', 'c.example.com', 'a.example.com'])
  })

  test('keeps the current endpoint after a 4xx or when every endpoint fails', async () => {
    const { service } = context(['https://a.example.com', 'https://b.example.com'])
    let status = 404
    const calls = stubFetch((url) => (url.startsWith('https://a.') ? respond(503) : respond(status)))

    await service.request('/status')
    status = 502
    await expect(service.request('/status')).rejects.toMatchObject({ kind: 'network' })

    expect(service.endpoint).toBe('https://b.example.com')
    expect(calls.map((c) => host(c.url))).toEqual(['a.example.com', 'b.example.com', 'b.example.com', 'a.example.com'])
  })

  test('POST without an Idempotency-Key is not sent to another replica', async () => {
    const { service } = context(['https://a.example.com', 'https://b.example.com'])
    const calls = stubFetch((url) => (url.startsWith('https://a.') ? Promise.reject(new TypeError('Failed to fetch')) : respond(200)))

    await expect(service.request('/unlock', { method: 'POST' })).rejects.toMatchObject({ kind: 'network' })
    expect(calls.map((c) => host(c.url))).toEqual(['a.example.com'])
    // The next request starts from the next replica.
    expect(service.endpoint).toBe('https://b.example.com')
  })

  test('a 5xx answer to a POST is returned as is, without failover', async () => {
    const { service } = context(['https://a.example.com', 'https://b.example.com'])
    const calls = stubFetch(() => respond(503))

    const response = await service.request('/unlock', { method: 'POST' })

    expect(response.status).toBe(503)
    expect(calls).toHaveLength(1)
    expect(service.endpoint).toBe('https://b.example.com')
  })

  test('POST and PUT with an Idempotency-Key fail over', async () => {
    const { service } = context(['https://a.example.com', 'https://b.example.com'])
    const calls = stubFetch((url) => (url.startsWith('https://a.') ? respond(502) : respond(200)))

    const post = await service.request('/unlock', { method: 'POST', headers: { 'Idempotency-Key': 'k1' } })
    const put = await service.request('/x', { method: 'PUT', headers: { 'Idempotency-Key': 'k2' } })

    expect([post.status, put.status]).toEqual([200, 200])
    expect(calls.map((c) => host(c.url))).toEqual(['a.example.com', 'b.example.com', 'b.example.com'])
  })

  test('which requests may be repeated on another replica', () => {
    expect(canFailOver({})).toBe(true)
    expect(canFailOver({ method: 'head' })).toBe(true)
    expect(canFailOver({ method: 'DELETE' })).toBe(false)
    expect(canFailOver({ method: 'PATCH', headers: { 'idempotency-key': 'k' } })).toBe(true)
    expect(canFailOver({ method: 'POST', headers: { 'Idempotency-Key': 'k' }, body: new ReadableStream() })).toBe(false)
  })

  test('an endpoint that does not answer in time is skipped', async () => {
    const { service } = context(['https://a.example.com', 'https://b.example.com'])
    const calls = stubFetch((url, _auth, init) => (url.startsWith('https://a.') ? hang(init) : respond(200)))

    const response = await service.request('/status')

    expect(response.status).toBe(200)
    expect(calls.map((c) => host(c.url))).toEqual(['a.example.com', 'b.example.com'])
  })

  test('a request cancelled by the caller is not retried elsewhere', async () => {
    const { service } = context(['https://a.example.com', 'https://b.example.com'])
    const calls = stubFetch((_url, _auth, init) => hang(init))
    const controller = new AbortController()

    const request = service.request('/status', { signal: controller.signal })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(calls).toHaveLength(1)
    expect(service.endpoint).toBe('https://a.example.com')
  })
})
