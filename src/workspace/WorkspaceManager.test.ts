import { beforeEach, describe, expect, test, vi } from 'vitest'
import { WorkspaceManager } from './WorkspaceManager'
import { Workspace } from './Workspace'
import { getLastWorkspaceId } from '@/lib/storage'

class TestWorkspace extends Workspace {
  readonly config = {}
  readonly identities = {}
  readonly services = {}
  init = vi.fn(async () => {})
  dispose = vi.fn()
}

function manager() {
  const created: TestWorkspace[] = []
  const m = new WorkspaceManager((id) => {
    const workspace = new TestWorkspace(id)
    created.push(workspace)
    return workspace
  })
  return { m, created }
}

describe('WorkspaceManager', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('opening initializes the new workspace and disposes of the previous one', async () => {
    const { m, created } = manager()
    const listener = vi.fn()
    m.subscribe(listener)

    const a = await m.open('a')
    const b = await m.open('b')

    expect(m.active).toBe(b)
    expect(created).toEqual([a, b])
    expect((a as TestWorkspace).init).toHaveBeenCalledOnce()
    expect((a as TestWorkspace).dispose).toHaveBeenCalledOnce()
    expect((b as TestWorkspace).dispose).not.toHaveBeenCalled()
    expect(getLastWorkspaceId()).toBe('b')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  test('opening the active workspace again keeps the instance', async () => {
    const { m, created } = manager()

    const first = await m.open('a')
    const again = await m.open('a')

    expect(again).toBe(first)
    expect(created).toHaveLength(1)
  })

  test('a later open supersedes one still initializing', async () => {
    const { m } = manager()

    const slow = m.open('a')
    const fast = m.open('b')

    await expect(slow).rejects.toThrow(/superseded/)
    expect((await fast).id).toBe('b')
    expect(m.active?.id).toBe('b')
  })

  test('a workspace that fails to initialize does not replace the active one', async () => {
    const { m } = manager()
    const a = await m.open('a')
    const failing = new TestWorkspace('b')
    failing.init.mockRejectedValueOnce(new Error('boom'))
    const m2 = new WorkspaceManager((id) => (id === 'b' ? failing : a))
    await m2.open('a')

    await expect(m2.open('b')).rejects.toThrow('boom')
    expect(m2.active).toBe(a)
  })

  test('close disposes of the active workspace', async () => {
    const { m } = manager()
    const a = await m.open('a')

    m.close()

    expect(m.active).toBeNull()
    expect((a as TestWorkspace).dispose).toHaveBeenCalledOnce()
  })
})
