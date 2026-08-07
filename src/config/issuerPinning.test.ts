import { expect, test, describe, beforeEach } from 'vitest'
import { DEFAULT_BACKENDS } from './backends'
import { getPinnedIssuers, pinIssuer, checkIssuerPin } from './issuerPinning'
import { getCachedIssuers } from '@/lib/storage'

const PROD_ISSUER = 'https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_SSH5Zn4xD'
const CUSTOM_URL = 'http://localhost:9999'
const CUSTOM_ISSUER = 'https://cognito-idp.example.com/custom-pool'

describe('checkIssuerPin', () => {
  beforeEach(() => {
    localStorage.clear()
    pinIssuer(CUSTOM_URL, CUSTOM_ISSUER)
  })

  test('returns nulls for a brand new backend/issuer pair', () => {
    expect(checkIssuerPin('http://localhost:8888', 'https://cognito-idp.example.com/new-pool'))
      .toEqual({ pinnedBackendUrl: null, pinnedIssuer: null })
  })

  test('returns the matching pair for an already known binding', () => {
    expect(checkIssuerPin(DEFAULT_BACKENDS.prod, PROD_ISSUER))
      .toEqual({ pinnedBackendUrl: DEFAULT_BACKENDS.prod, pinnedIssuer: PROD_ISSUER })
    expect(checkIssuerPin(CUSTOM_URL, CUSTOM_ISSUER))
      .toEqual({ pinnedBackendUrl: CUSTOM_URL, pinnedIssuer: CUSTOM_ISSUER })
  })

  test('flags a known backend presenting a different issuer', () => {
    const { pinnedBackendUrl, pinnedIssuer } = checkIssuerPin(DEFAULT_BACKENDS.prod, 'https://evil.example.com')
    expect(pinnedIssuer).toBe(PROD_ISSUER) // issuer pinned for this backend
    expect(pinnedBackendUrl).toBeNull() // the fake issuer belongs to nobody
  })

  test('flags an unknown backend claiming an issuer that belongs to another backend', () => {
    const { pinnedBackendUrl, pinnedIssuer } = checkIssuerPin('http://localhost:8888', PROD_ISSUER)
    expect(pinnedBackendUrl).toBe(DEFAULT_BACKENDS.prod) // owner of that issuer
    expect(pinnedIssuer).toBeNull() // this new backend has no pinned issuer yet
  })
})

describe('getPinnedIssuers / pinIssuer', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('hardcoded issuer wins over a stale cached value for the same backend', () => {
    pinIssuer(DEFAULT_BACKENDS.prod, 'https://stale.example.com/pool')
    expect(getPinnedIssuers()[DEFAULT_BACKENDS.prod]).toBe(PROD_ISSUER)
  })

  test('caches a binding for a custom backend', () => {
    pinIssuer(CUSTOM_URL, CUSTOM_ISSUER)
    expect(getPinnedIssuers()[CUSTOM_URL]).toBe(CUSTOM_ISSUER)
  })

  test('prunes entries that duplicate a hardcoded default when writing', () => {
    pinIssuer(DEFAULT_BACKENDS.prod, 'https://stale.example.com/pool')
    pinIssuer(CUSTOM_URL, CUSTOM_ISSUER)
    expect(getCachedIssuers()).toEqual({ [CUSTOM_URL]: CUSTOM_ISSUER })
  })
})
