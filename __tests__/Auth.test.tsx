import { expect, test, describe, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import Auth from '../app/ui/Auth'
import { AizaProvider } from '@/app/ui/context/AizaProvider'

describe('Auth component', () => {
  afterEach(() => {
    cleanup()
  })

  test('renders user button', () => {
    const { asFragment } = render(<AizaProvider><Auth /></AizaProvider>)
    expect(screen.getByRole('button')).toBeDefined()
    expect(asFragment()).toMatchSnapshot();
  })

  test('all menu items visible when menu is open', () => {
    render(<AizaProvider><Auth /></AizaProvider>)
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Login')).toBeDefined()
    expect(screen.getByText('Logout')).toBeDefined()
    expect(screen.getByText('Dev Backend')).toBeDefined()
    expect(screen.getByText('Prod Backend')).toBeDefined()
    expect(screen.getByText('Get Access Key')).toBeDefined()
  })

  test('backend selection items have correct selected state', () => {
    render(<AizaProvider><Auth /></AizaProvider>)
    fireEvent.click(screen.getByRole('button'))

    const devBackendItem = screen.getByText('Dev Backend').closest('li')
    const prodBackendItem = screen.getByText('Prod Backend').closest('li')

    // Dev backend should be selected by default (test runs on localhost)
    expect(devBackendItem?.classList.contains('Mui-selected')).toBe(true)
    expect(prodBackendItem?.classList.contains('Mui-selected')).toBe(false)
  })
})
