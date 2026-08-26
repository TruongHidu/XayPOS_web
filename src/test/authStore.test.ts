import { describe, expect, it, beforeEach } from 'vitest'
import { useAuthStore } from '../features/auth/store/authStore'
import { tokenStorage } from '../shared/storage/tokenStorage'
import { getAccessToken } from '../shared/api/httpClient'

describe('auth session', () => {
  beforeEach(() => { useAuthStore.getState().clearSession() })
  it('rotates the refresh token and keeps access token in memory', async () => {
    tokenStorage.writeRefreshToken('refresh-old')
    await useAuthStore.getState().refreshSession()
    expect(tokenStorage.readRefreshToken()).toBe('refresh-rotated')
    expect(getAccessToken()).toBe('access-rotated')
    expect(localStorage.getItem('accessToken')).toBeNull()
  })
  it('clears all local state when refresh fails', async () => {
    tokenStorage.writeRefreshToken('invalid')
    await expect(useAuthStore.getState().refreshSession()).rejects.toBeTruthy()
    expect(tokenStorage.readRefreshToken()).toBeNull()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(getAccessToken()).toBeNull()
  })
  it('always clears state when logout endpoint fails', async () => {
    tokenStorage.writeRefreshToken('refresh-old')
    await useAuthStore.getState().signIn({ email: 'admin@example.com', password: 'correct' })
    const { server } = await import('./server')
    const { http, HttpResponse } = await import('msw')
    server.use(http.post('http://localhost:8080/api/v1/auth/logout', () => HttpResponse.json({ message: 'down' }, { status: 500 })))
    await useAuthStore.getState().signOut()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
  })
})
