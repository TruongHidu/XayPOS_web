import { describe, expect, it, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { useAuthStore } from '../features/auth/store/authStore'
import { getAccessToken, setAccessToken } from '../shared/api/httpClient'
import { sessionHint } from '../shared/storage/sessionHint'
import { mockRefreshCookie, seedBrowserSession, server } from './server'

describe('auth session', () => {
  beforeEach(() => { useAuthStore.getState().clearSession() })

  it('rotates the HttpOnly cookie and keeps the access token only in memory', async () => {
    let transport: string | null = null
    let withBody = true
    server.events.on('request:start', ({ request }) => {
      if (!request.url.endsWith('/auth/refresh')) return
      transport = request.headers.get('X-Auth-Transport')
      withBody = request.body !== null
    })
    seedBrowserSession('refresh-old')
    await useAuthStore.getState().refreshSession()
    server.events.removeAllListeners()
    expect(transport).toBe('cookie')
    expect(withBody).toBe(false)
    expect(mockRefreshCookie.value).toBe('refresh-rotated')
    expect(getAccessToken()).toBe('access-rotated')
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('refresh-')
  })

  it('clears all local state when refresh fails', async () => {
    seedBrowserSession('invalid')
    await expect(useAuthStore.getState().refreshSession()).rejects.toBeTruthy()
    expect(sessionHint.present()).toBe(false)
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(getAccessToken()).toBeNull()
  })

  it('restores the session on a new page load from the cookie alone', async () => {
    seedBrowserSession('refresh-old')
    useAuthStore.setState({ status: 'bootstrapping' })
    await useAuthStore.getState().bootstrap()
    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(getAccessToken()).toBe('access-rotated')
  })

  it('does not call refresh for a browser that never signed in', async () => {
    let refreshCalls = 0
    server.use(http.post('http://localhost:8080/api/v1/auth/refresh', () => { refreshCalls += 1; return HttpResponse.json({}, { status: 401 }) }))
    useAuthStore.setState({ status: 'bootstrapping' })
    await useAuthStore.getState().bootstrap()
    expect(refreshCalls).toBe(0)
    expect(useAuthStore.getState().status).toBe('unauthenticated')
  })

  it('logs out through the cookie even after the access token expired', async () => {
    await useAuthStore.getState().signIn({ email: 'admin@example.com', password: 'correct' })
    expect(mockRefreshCookie.value).toBe('refresh-1')
    setAccessToken(null)
    await useAuthStore.getState().signOut()
    expect(mockRefreshCookie.value).toBeNull()
    expect(sessionHint.present()).toBe(false)
    expect(useAuthStore.getState().status).toBe('unauthenticated')
  })

  it('always clears state when logout endpoint fails', async () => {
    await useAuthStore.getState().signIn({ email: 'admin@example.com', password: 'correct' })
    server.use(http.post('http://localhost:8080/api/v1/auth/logout', () => HttpResponse.json({ message: 'down' }, { status: 500 })))
    await useAuthStore.getState().signOut()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(sessionHint.present()).toBe(false)
  })

  it('signs this tab out when another tab signs out', async () => {
    const { render } = await import('@testing-library/react')
    const { AuthBootstrap } = await import('../features/auth/components/AuthBootstrap')
    await useAuthStore.getState().signIn({ email: 'admin@example.com', password: 'correct' })
    render(<AuthBootstrap><div>APP</div></AuthBootstrap>)
    window.dispatchEvent(new StorageEvent('storage', { key: 'pos.session', oldValue: '1', newValue: null }))
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(getAccessToken()).toBeNull()
  })
})
