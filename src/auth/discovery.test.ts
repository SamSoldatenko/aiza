import { afterEach, describe, expect, test, vi } from 'vitest'
import { discoveryUrl, fetchOpenIdConfig } from './discovery'
import type { IdentityConfig } from '@/auth/identity'

const IDENTITY: IdentityConfig = {
  issuer: 'https://idp.example.com/pool',
  clientId: 'client',
  idpAdapter: 'cognito',
  scopes: ['openid'],
  redirectOrigins: [],
}

function stubDiscovery(body: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({ ok, json: async () => body }) as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('fetchOpenIdConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('loads the discovery document from the configured issuer', async () => {
    const fetchMock = stubDiscovery({ issuer: IDENTITY.issuer, token_endpoint: 'https://idp.example.com/token' })

    const config = await fetchOpenIdConfig(IDENTITY)

    expect(fetchMock).toHaveBeenCalledWith('https://idp.example.com/pool/.well-known/openid-configuration')
    expect(config.token_endpoint).toBe('https://idp.example.com/token')
  })

  test('rejects a discovery document that names a different issuer', async () => {
    stubDiscovery({ issuer: 'https://evil.example.com' })
    await expect(fetchOpenIdConfig(IDENTITY)).rejects.toThrow(/unexpected issuer/)
  })

  test('rejects when the discovery document cannot be loaded', async () => {
    stubDiscovery({}, false)
    await expect(fetchOpenIdConfig(IDENTITY)).rejects.toThrow(/Cannot load/)
  })
})

test('discoveryUrl tolerates a trailing slash on the issuer', () => {
  expect(discoveryUrl('https://idp.example.com/pool/')).toBe('https://idp.example.com/pool/.well-known/openid-configuration')
})
