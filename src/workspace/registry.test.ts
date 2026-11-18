import { beforeEach, describe, expect, test } from 'vitest'
import {
  addWorkspace,
  createWorkspace,
  defaultWorkspaceId,
  deleteWorkspace,
  isAvailableHere,
  builtInWorkspaces,
  listWorkspaces,
  newWorkspace,
  UnknownWorkspaceError,
  workspaceIdError,
  workspaceTypes,
} from './registry'
import { UnsupportedWorkspace } from './UnsupportedWorkspace'
import { PersonalVaultWorkspace } from './personalVault/PersonalVaultWorkspace'
import { AIZA_DEV_OWNER, BIN932_OWNER } from './identities'
import { getStoredWorkspaces, setLastWorkspaceId, setStoredWorkspaces, workspaceStorage } from '@/lib/storage'

describe('listWorkspaces', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('lists built-in workspaces never opened, without saving anything', () => {
    expect(listWorkspaces().map((w) => [w.id, w.source, w.status, w.opened])).toEqual([
      ['aiza', 'built-in', 'available', false],
      ['dev', 'built-in', 'available', false],
    ])
    expect(listWorkspaces()[0]).toMatchObject({ type: 'PersonalVaultWorkspace', config: { api: 'https://aiza-be.bin932.com:3150' } })
    expect(getStoredWorkspaces()).toEqual({})
  })

  test('opened workspaces come first, in the order they were opened', () => {
    addWorkspace('mine', PersonalVaultWorkspace.name, { api: 'https://api.example.com' }, { color: '#ff0000' })
    createWorkspace('dev')

    expect(listWorkspaces().map((w) => [w.id, w.source, w.opened])).toEqual([
      ['mine', 'custom', true],
      ['dev', 'built-in', true],
      ['aiza', 'built-in', false],
    ])
    expect(listWorkspaces()[0]).toMatchObject({ config: { api: 'https://api.example.com' }, presentation: { color: '#ff0000' } })
  })

  test('records this build cannot create stay listed as unsupported', () => {
    setStoredWorkspaces({
      future: { type: 'TravelAgentWorkspace', config: { tenant: 'tui' } },
      broken: 'x',
      gone: { builtInId: 'removed', type: 'PersonalVaultWorkspace', config: {} },
      aiza: { type: 'PersonalVaultWorkspace', config: { api: 'https://evil.example.com' } },
    })

    const byId = Object.fromEntries(listWorkspaces().map((w) => [w.id, w]))
    expect(byId.future).toMatchObject({ status: 'unsupported', type: 'TravelAgentWorkspace', source: 'custom', config: { tenant: 'tui' } })
    expect(byId.broken).toMatchObject({ status: 'unsupported' })
    expect(byId.gone).toMatchObject({ status: 'unsupported', source: 'built-in' })
    // A user's record can't take over the id of a built-in workspace.
    expect(byId.aiza).toMatchObject({ status: 'unsupported', source: 'custom' })
    expect(Object.keys(getStoredWorkspaces())).toEqual(['future', 'broken', 'gone', 'aiza'])
  })
})

describe('createWorkspace', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('the first opening of a built-in workspace saves its record', () => {
    const workspace = createWorkspace('aiza')

    expect(workspace).toBeInstanceOf(PersonalVaultWorkspace)
    expect((workspace as PersonalVaultWorkspace).account.endpoints).toEqual(['https://aiza-be.bin932.com:3150'])
    expect(getStoredWorkspaces()).toEqual({ aiza: { builtInId: 'aiza', type: 'PersonalVaultWorkspace', config: {} } })
  })

  test('a built-in workspace is configured by code only; its presentation is kept', () => {
    setStoredWorkspaces({
      aiza: { builtInId: 'aiza', type: 'PersonalVaultWorkspace', config: { api: 'https://evil.example.com' }, presentation: { color: '#123456' } },
    })

    const workspace = createWorkspace('aiza') as PersonalVaultWorkspace

    expect(workspace.account.endpoints).toEqual(['https://aiza-be.bin932.com:3150'])
    expect(getStoredWorkspaces().aiza).toMatchObject({ presentation: { color: '#123456' } })
  })

  test('a workspace the user created gets the stored configuration', () => {
    addWorkspace('mine', PersonalVaultWorkspace.name, { api: 'https://api.example.com', vault: ['https://v1.example.com', 'https://v2.example.com'] })

    const workspace = createWorkspace('mine') as PersonalVaultWorkspace

    expect(workspace.account.endpoints).toEqual(['https://api.example.com'])
    expect(workspace.vault.endpoints.toSorted()).toEqual(['https://v1.example.com', 'https://v2.example.com'])
    expect(workspace.dataVault.configured).toBe(false)
  })

  test('an up-to-date record is not rewritten', () => {
    addWorkspace('mine', PersonalVaultWorkspace.name, { api: 'https://api.example.com' })
    createWorkspace('aiza')
    const before = localStorage.getItem('aiza:workspaces')

    createWorkspace('mine')
    createWorkspace('aiza')

    expect(localStorage.getItem('aiza:workspaces')).toBe(before)
  })

  test('a record of an unknown class opens as unsupported and is kept as is', () => {
    const record = { type: 'TravelAgentWorkspace', config: { tenant: 'tui' } }
    setStoredWorkspaces({ future: record })
    workspaceStorage('future').set('draft', 'x')

    const workspace = createWorkspace('future')

    expect(workspace).toBeInstanceOf(UnsupportedWorkspace)
    expect((workspace as UnsupportedWorkspace).record).toEqual(record)
    expect(workspace.services).toEqual({})
    expect(workspace.exportData()).toEqual({ storage: { draft: 'x' } })
    expect(getStoredWorkspaces()).toEqual({ future: record })
  })

  test('an id that is neither stored nor built-in is unknown', () => {
    expect(() => createWorkspace('missing')).toThrow(UnknownWorkspaceError)
  })
})

describe('workspaces of the device', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('ids of built-in, used and malformed workspaces are rejected', () => {
    addWorkspace('mine', PersonalVaultWorkspace.name, {})

    expect(workspaceIdError('aiza')).toMatch(/reserved/)
    expect(workspaceIdError('mine')).toMatch(/already used/)
    expect(workspaceIdError('Not Valid')).toMatch(/lowercase/)
    expect(workspaceIdError('-x')).toMatch(/lowercase/)
    expect(workspaceIdError('other')).toBeNull()
    expect(() => addWorkspace('dev', PersonalVaultWorkspace.name, {})).toThrow(/reserved/)
    expect(() => addWorkspace('notes', 'NotesWorkspace', {})).toThrow(/not a workspace type/)
  })

  test('deleteWorkspace removes the record and the data of that workspace only', () => {
    addWorkspace('ws-a', PersonalVaultWorkspace.name, {})
    addWorkspace('ws-b', PersonalVaultWorkspace.name, {})
    workspaceStorage('ws-a').set('draft', 'a')
    workspaceStorage('ws-b').set('draft', 'b')

    deleteWorkspace('ws-a')

    expect(Object.keys(getStoredWorkspaces())).toEqual(['ws-b'])
    expect(workspaceStorage('ws-a').get('draft', null)).toBeNull()
    expect(workspaceStorage('ws-b').get('draft', null)).toBe('b')
  })

  test('first launch opens the built-in workspace preferred by this build', () => {
    expect(defaultWorkspaceId()).toBe('dev')
    expect(getStoredWorkspaces()).toEqual({})
  })

  test('defaultWorkspaceId prefers the last opened workspace that still exists', () => {
    addWorkspace('ws-a', PersonalVaultWorkspace.name, {})
    addWorkspace('ws-b', PersonalVaultWorkspace.name, {})

    expect(defaultWorkspaceId()).toBe('ws-a')
    setLastWorkspaceId('ws-b')
    expect(defaultWorkspaceId()).toBe('ws-b')
    deleteWorkspace('ws-b')
    expect(defaultWorkspaceId()).toBe('ws-a')
  })

  test('the dev workspace signs in with the aiza-dev user pool, aiza with aiza-users', () => {
    expect(createWorkspace('dev').identities).toEqual({ owner: AIZA_DEV_OWNER })
    expect(createWorkspace('aiza').identities).toEqual({ owner: BIN932_OWNER })
    expect(() => newWorkspace(PersonalVaultWorkspace.name, 'x', { identity: 'nobody' })).toThrow(/No identity "nobody"/)
  })

  test('a workspace is available only where its identity provider redirects to', () => {
    const workspace = createWorkspace('aiza')
    expect(isAvailableHere(workspace, 'http://localhost:5173')).toBe(true)
    expect(isAvailableHere(workspace, 'https://evil.example.com')).toBe(false)
  })

  test('supported types, their creation and built-in workspaces agree', () => {
    expect(workspaceTypes).toEqual(['PersonalVaultWorkspace'])
    for (const type of workspaceTypes) {
      expect(newWorkspace(type, 'x', {})?.constructor.name).toBe(type)
    }
    expect(newWorkspace('NoSuchWorkspace', 'x', {})).toBeNull()
    for (const builtIn of Object.values(builtInWorkspaces)) {
      expect(workspaceTypes).toContain(builtIn.type)
    }
  })
})

describe('workspace data', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('two workspaces never see each other\'s keys or queries', () => {
    const a = createWorkspace('aiza')
    const b = createWorkspace('dev')
    a.storage.set('k', 1)

    expect(b.storage.get('k', 'missing')).toBe('missing')
    expect(a.queryKey('vault', 'status')).toEqual(['ws', 'aiza', 'vault', 'status'])
    expect(a.queryKey()).not.toEqual(b.queryKey())
  })

  test('export and import carry the workspace storage only', () => {
    const a = createWorkspace('aiza')
    a.storage.set('draft', { text: 'hi' })
    workspaceStorage('dev').set('draft', 'other')

    const exported = a.exportData()
    expect(exported).toEqual({ storage: { draft: { text: 'hi' } } })

    a.storage.set('stale', true)
    a.importData({ storage: { draft: 'restored' } })
    expect(a.exportData()).toEqual({ storage: { draft: 'restored' } })
    expect(workspaceStorage('dev').get('draft', null)).toBe('other')
  })
})
