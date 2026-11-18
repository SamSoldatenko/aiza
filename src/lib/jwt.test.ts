import { describe, expect, test } from 'vitest'
import { decodeJwtPayload } from './jwt'

function base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function makeJwt(payload: unknown): string {
  return `${base64Url(JSON.stringify({ alg: 'none' }))}.${base64Url(JSON.stringify(payload))}.sig`
}

describe('decodeJwtPayload', () => {
  test('decodes base64url payloads containing "-" and "_"', () => {
    // '>>>' and '???' encode to base64 with '+' and '/', i.e. '-' and '_' in base64url.
    const token = makeJwt({ a: '>>>', b: '???' })
    expect(token.split('.')[1]).toMatch(/[-_]/)
    expect(decodeJwtPayload(token)).toEqual({ a: '>>>', b: '???' })
  })

  test('decodes payloads without base64 padding', () => {
    const token = makeJwt({ x: 'y' })
    expect(token.split('.')[1]).not.toContain('=')
    expect(decodeJwtPayload(token)).toEqual({ x: 'y' })
  })

  test('decodes UTF-8 claims', () => {
    expect(decodeJwtPayload(makeJwt({ name: 'Семён' }))).toEqual({ name: 'Семён' })
  })

  test.each([
    ['two parts', 'abc.def'],
    ['empty string', ''],
    ['invalid base64 characters', 'a.b*c!.e'],
    ['impossible base64 length', 'a.abcde.c'],
    ['not JSON', `a.${base64Url('not json')}.c`],
    ['JSON array', `a.${base64Url('[1,2]')}.c`],
    ['JSON null', `a.${base64Url('null')}.c`],
    ['invalid UTF-8', `a.${btoa('\xff\xfe').replace(/=+$/, '')}.c`],
  ])('returns null for %s', (_name, token) => {
    expect(decodeJwtPayload(token)).toBeNull()
  })
})
