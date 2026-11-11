// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { authFetch } from '../lib/authFetch'
vi.mock('../lib/config', () => ({ getSystemConfig: async () => ({}) }))
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals() })
function SessionState() {
  const { user, isLoading } = useAuth()
  return <div>{isLoading ? 'loading' : user ? 'signed-in' : 'signed-out'}</div>
}
it('leaves the authenticated screen when configuration loading rejects the session', async () => {
  localStorage.setItem('auth_token', 'expired')
  localStorage.setItem('auth_user', JSON.stringify({ id: 'test', email: 'test@example.com' }))
  window.history.replaceState({}, '', '/traders')
  render(<AuthProvider><SessionState /></AuthProvider>)
  await waitFor(() => expect(screen.getByText('signed-in')).toBeTruthy())
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
  await act(async () => { await authFetch('/api/my-traders', { headers: { Authorization: 'Bearer expired' } }) })
  expect(screen.getByText('signed-out')).toBeTruthy()
  expect(window.location.pathname).toBe('/login')
})
