import { expect, test, describe, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'

async function openUserMenu(): Promise<void> {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/w/dev/'] }) })
  render(<RouterProvider router={router} />)
  fireEvent.click(await screen.findByTitle('Not logged in'))
}

describe('Auth component', () => {
  beforeEach(() => {
    localStorage.clear()
    // Identity provider discovery and backend info are not under test here.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  test('signed out: login enabled, sign-out items disabled', async () => {
    await openUserMenu()

    expect(screen.getByText('Login').closest('li')?.getAttribute('aria-disabled')).not.toBe('true')
    expect(screen.getByText('Sign out of this workspace').closest('li')?.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Logout').closest('li')?.getAttribute('aria-disabled')).toBe('true')
  })

  test('backend cannot be switched from the menu', async () => {
    await openUserMenu()

    expect(screen.queryByText(/Backend/)).toBeNull()
  })
})
