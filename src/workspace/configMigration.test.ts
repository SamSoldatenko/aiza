import { beforeEach, describe, expect, test, vi } from 'vitest'
import { addWorkspace, createWorkspace, listWorkspaces } from './registry'
import { getStoredWorkspaces, setStoredWorkspaces } from '@/lib/storage'

// A PersonalVaultWorkspace whose config format changed: `apiUrl` became `api`.
// Replaces the real class, so the registry creates this one by its name.
vi.mock('./personalVault/PersonalVaultWorkspace', async () => {
  const { Workspace } = await import('./Workspace')
  class PersonalVaultWorkspace extends Workspace {
    readonly identities = {}
    readonly services = {}
    readonly config: { api?: string }

    constructor(id: string, config: { api?: string; apiUrl?: string }) {
      super(id)
      if (config.apiUrl === undefined) {
        this.config = config
      } else {
        const { apiUrl, ...rest } = config
        this.config = { ...rest, api: apiUrl }
      }
    }
  }
  return { PersonalVaultWorkspace }
})

describe('configuration migrated by the workspace class', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('is saved to the record of a workspace the user created', () => {
    setStoredWorkspaces({ mine: { type: 'PersonalVaultWorkspace', config: { apiUrl: 'https://api.example.com' }, presentation: { title: 'Mine' } } })

    const workspace = createWorkspace('mine')

    expect(workspace.config).toEqual({ api: 'https://api.example.com' })
    expect(getStoredWorkspaces().mine).toEqual({ type: 'PersonalVaultWorkspace', config: { api: 'https://api.example.com' }, presentation: { title: 'Mine' } })
  })

  test('listing shows the stored configuration and saves nothing', () => {
    addWorkspace('mine', 'PersonalVaultWorkspace', { apiUrl: 'https://api.example.com' })

    expect(listWorkspaces()[0]).toMatchObject({ id: 'mine', config: { apiUrl: 'https://api.example.com' } })
    expect(getStoredWorkspaces().mine).toEqual({ type: 'PersonalVaultWorkspace', config: { apiUrl: 'https://api.example.com' } })
  })

  test('a current configuration leaves the record as it is', () => {
    addWorkspace('mine', 'PersonalVaultWorkspace', { api: 'https://api.example.com' })
    const before = localStorage.getItem('aiza:workspaces')

    createWorkspace('mine')

    expect(localStorage.getItem('aiza:workspaces')).toBe(before)
  })
})
