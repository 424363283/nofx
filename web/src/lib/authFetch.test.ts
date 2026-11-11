// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { authFetch, AUTH_EXPIRED_EVENT, AUTH_EXPIRED_NOTICE } from './authFetch'

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
afterEach(() => vi.unstubAllGlobals())
it('invalidates a rejected session and reports expiration instead of empty configuration', async () => {
  localStorage.setItem('auth_token', 'expired')
  localStorage.setItem('auth_user', '{"id":"user"}')
  const expired = vi.fn()
  window.addEventListener(AUTH_EXPIRED_EVENT, expired)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
  await authFetch('/api/models', { headers: { Authorization: 'Bearer expired' } })
  expect(localStorage.getItem('auth_token')).toBeNull()
  expect(localStorage.getItem('auth_user')).toBeNull()
  expect(sessionStorage.getItem(AUTH_EXPIRED_NOTICE)).toBe('1')
  expect(expired).toHaveBeenCalledTimes(1)
  await authFetch('/api/exchanges', { headers: { Authorization: 'Bearer expired' } })
  expect(expired).toHaveBeenCalledTimes(1)
  window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
})
it('does not clear a new login when an older request returns 401', async () => {
  localStorage.setItem('auth_token', 'new-session')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
  await authFetch('/api/models', { headers: { Authorization: 'Bearer old-session' } })
  expect(localStorage.getItem('auth_token')).toBe('new-session')
})
it('does not log out on public 401, permission denial or server failure', async () => {
  localStorage.setItem('auth_token', 'valid')
  for (const status of [401, 403, 500]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })))
    await authFetch('/api/models', status === 401 ? undefined : { headers: { Authorization: 'Bearer valid' } })
    expect(localStorage.getItem('auth_token')).toBe('valid')
  }
})
