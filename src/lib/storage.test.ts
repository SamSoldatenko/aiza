import { beforeEach, describe, expect, test } from 'vitest'
import { getPreferences, migrateLegacyStorage } from './storage'

describe('migrateLegacyStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('carries the theme of the current backend over to device preferences', () => {
    localStorage.setItem('aiza_current_backend', 'https://aiza-be.bin932.com:3150')
    localStorage.setItem('aiza_settings:localhost:8080', JSON.stringify({ theme: 'light' }))
    localStorage.setItem('aiza_settings:aiza-be.bin932.com:3150', JSON.stringify({ theme: 'dark' }))

    migrateLegacyStorage()

    expect(getPreferences({})).toEqual({ theme: 'dark' })
  })

  test('falls back to any backend theme when no backend was selected', () => {
    localStorage.setItem('aiza_settings:localhost:8080', JSON.stringify({ theme: 'light' }))

    migrateLegacyStorage()

    expect(getPreferences({})).toEqual({ theme: 'light' })
  })

  test('removes every legacy key and keeps unrelated ones', () => {
    localStorage.setItem('aiza_current_backend', 'http://localhost:8080')
    localStorage.setItem('aiza_backend_issuers', '{}')
    localStorage.setItem('aiza_backend_history', '[]')
    localStorage.setItem('aiza_settings:localhost:8080', '{}')
    localStorage.setItem('aiza_tokens', '[]')
    localStorage.setItem('aiza:workspaces', '[]')

    migrateLegacyStorage()

    expect(localStorage.getItem('aiza:workspaces')).toBe('[]')
    expect(localStorage.getItem('aiza_tokens')).toBeNull()
    expect(localStorage.getItem('aiza_current_backend')).toBeNull()
    expect(localStorage.getItem('aiza_backend_issuers')).toBeNull()
    expect(localStorage.getItem('aiza_backend_history')).toBeNull()
    expect(localStorage.getItem('aiza_settings:localhost:8080')).toBeNull()
  })

  test('does not overwrite existing device preferences', () => {
    localStorage.setItem('aiza:prefs', JSON.stringify({ theme: 'system' }))
    localStorage.setItem('aiza_settings:localhost:8080', JSON.stringify({ theme: 'dark' }))

    migrateLegacyStorage()

    expect(getPreferences({})).toEqual({ theme: 'system' })
  })
})
