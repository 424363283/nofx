export const AUTH_EXPIRED_EVENT = 'guanlan:auth-expired'
export const AUTH_EXPIRED_NOTICE = 'guanlan:auth-expired-notice'

// A delayed 401 for an old session must never log out a newly signed-in user.
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  const authorization = headers.get('Authorization')
  const response = await globalThis.fetch(input, init)
  const currentToken = localStorage.getItem('auth_token')
  if (response.status === 401 && currentToken && authorization === `Bearer ${currentToken}`) {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    sessionStorage.setItem(AUTH_EXPIRED_NOTICE, '1')
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  }
  return response
}
