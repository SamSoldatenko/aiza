import { describe, expect, test } from 'vitest'
import { grantKey, isSignedIn, parseSession, requestedScopes, tokensToGrant, type Session } from './session'
import type { IdentityConfig } from './identity'

const IDENTITY: IdentityConfig = { issuer: 'https://idp.example.com', clientId: 'c', idpAdapter: 'cognito', scopes: ['openid', 'email'], redirectOrigins: [] }

function part(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function jwt(payload: Record<string, unknown>): string {
  return `${part({ alg: 'none' })}.${part(payload)}.sig`
}

function response(claims: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    access_token: jwt({ sub: 'u', scope: 'openid email vault/read' }),
    id_token: jwt({ iss: IDENTITY.issuer, aud: 'c', sub: 'u', ...claims }),
    expires_in: 60,
    token_type: 'Bearer',
    ...extra,
  }
}

describe('grants', () => {
  test('an authorization asks for the identity\'s scopes and the service\'s', () => {
    expect(requestedScopes(IDENTITY, ['vault/read', 'openid'])).toEqual(['openid', 'email', 'vault/read'])
  })

  test('a grant is keyed by its set of scopes, whatever their order', () => {
    expect(grantKey(IDENTITY, ['b/x', 'a/y'])).toBe(grantKey(IDENTITY, ['a/y', 'b/x', 'email']))
    expect(grantKey(IDENTITY, [])).toBe('email openid')
  })

  test('a session is signed in while one of its grants can give a token', () => {
    const session: Session = { id: 's', sub: 'u', claims: { sub: 'u' }, grants: { a: { scopes: [], accessToken: 't', expiresAt: 10 } } }
    expect(isSignedIn(session, 5)).toBe(true)
    expect(isSignedIn(session, 20)).toBe(false)
    expect(isSignedIn({ ...session, grants: { a: { scopes: [], refreshToken: 'r', expiresAt: 0 } } }, 20)).toBe(true)
    expect(isSignedIn(null, 0)).toBe(false)
  })
})

describe('stored sessions', () => {
  test('a session of the current format is read back', () => {
    const session: Session = { id: 's', sub: 'u', claims: { sub: 'u' }, grants: { 'email openid': { scopes: ['openid'], refreshToken: 'r', expiresAt: 1 } } }
    expect(parseSession(JSON.parse(JSON.stringify(session)))).toEqual(session)
  })

  test('a session of the older format (access tokens by audience) is not read', () => {
    const old = { issuer: 'i', clientId: 'c', sub: 'u', claims: { sub: 'u' }, grantedScopes: [], accessTokens: { '*': { token: 't', expiresAt: 1 } } }
    expect(parseSession(old)).toBeNull()
  })

  test('malformed grants are dropped', () => {
    const value = { id: 's', sub: 'u', claims: { sub: 'u' }, grants: { good: { scopes: [], expiresAt: 1 }, bad: { scopes: 'x' } } }
    expect(Object.keys(parseSession(value)!.grants)).toEqual(['good'])
  })
})

describe('tokens to a grant', () => {
  test('takes the granted scopes from the access token and the expiry from expires_in', () => {
    const issued = tokensToGrant(IDENTITY, response({ email: 'u@example.com' }), ['openid'], 1000)
    expect(issued.sub).toBe('u')
    expect(issued.claims).toEqual({ sub: 'u', email: 'u@example.com' })
    expect(issued.grant).toMatchObject({ scopes: ['openid', 'email', 'vault/read'], expiresAt: 61_000 })
  })

  test('keeps the previous refresh token when the IdP does not rotate it', () => {
    const issued = tokensToGrant(IDENTITY, response({}), ['openid'], 0, 'u', { scopes: [], refreshToken: 'old', expiresAt: 0 })
    expect(issued.grant.refreshToken).toBe('old')
  })

  test('rejects an ID token of another issuer or client, and tokens of another user', () => {
    expect(() => tokensToGrant(IDENTITY, response({ aud: 'other' }), [], 0)).toThrow(/different identity provider or client/)
    expect(() => tokensToGrant(IDENTITY, response({ iss: 'https://evil.example.com' }), [], 0)).toThrow(/different identity provider or client/)
    expect(() => tokensToGrant(IDENTITY, response({}), [], 0, 'someone-else')).toThrow(/different user/)
  })
})
