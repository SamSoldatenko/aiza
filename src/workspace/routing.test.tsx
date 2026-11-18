import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { addWorkspace } from '@/workspace/registry'
import { workspaceManager } from '@/workspace/WorkspaceManager'
import { PersonalVaultWorkspace } from '@/workspace/personalVault/PersonalVaultWorkspace'
import { getStoredWorkspaces, setLastWorkspaceId, setStoredWorkspaces } from '@/lib/storage'

function renderAt(path: string) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  render(<RouterProvider router={router} />)
  return router
}

describe('workspace routing', () => {
  beforeEach(() => {
    localStorage.clear()
    workspaceManager.close()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  test('/ opens the preferred built-in workspace on first launch and saves its record', async () => {
    const router = renderAt('/')

    await waitFor(() => expect(router.state.location.pathname).toBe('/w/dev'))
    expect(getStoredWorkspaces()).toEqual({ dev: { builtInId: 'dev', type: 'PersonalVaultWorkspace', config: {} } })
    expect(workspaceManager.active?.id).toBe('dev')
  })

  test('/ opens the last opened workspace', async () => {
    addWorkspace('first', PersonalVaultWorkspace.name, {})
    addWorkspace('second', PersonalVaultWorkspace.name, {})
    setLastWorkspaceId('second')

    const router = renderAt('/')

    await waitFor(() => expect(router.state.location.pathname).toBe('/w/second'))
  })

  test('a link to a built-in workspace opens it and adds it to the device', async () => {
    renderAt('/w/aiza/')

    expect(await screen.findByLabelText('Workspace: Aiza')).toBeDefined()
    expect(Object.keys(getStoredWorkspaces())).toEqual(['aiza'])
  })

  test('an unknown workspace id redirects to the workspace list', async () => {
    const router = renderAt('/w/does-not-exist/')

    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces'))
  })

  test('a workspace of a type this build does not know is shown as unsupported and kept', async () => {
    setStoredWorkspaces({ future1: { type: 'TravelAgentWorkspace', config: {} } })

    renderAt('/w/future1/')

    expect(await screen.findByText(/has no workspaces of type TravelAgentWorkspace/)).toBeDefined()
    expect(screen.getByText('Export data')).toBeDefined()
    expect(getStoredWorkspaces()).toHaveProperty('future1')
  })

  test('workspace settings show its identities and services', async () => {
    renderAt('/w/dev/settings')

    expect(await screen.findByText('Encrypted volume')).toBeDefined()
    expect(screen.getByText('Owner')).toBeDefined()
    expect(screen.getAllByText('Not configured')).toHaveLength(3)
    // The account service has an address; nobody is signed in.
    expect(screen.getByText('Sign-in required')).toBeDefined()
  })
})
