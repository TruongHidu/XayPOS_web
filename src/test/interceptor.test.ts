import { describe, expect, it, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { api, getAccessToken, setAccessToken, tokenStorage } from '../shared/api/httpClient'
import { server } from './server'
import { useAuthStore } from '../features/auth/store/authStore'

describe('protected request interceptor', () => {
  beforeEach(() => { useAuthStore.getState().clearSession(); tokenStorage.writeRefreshToken('refresh-old'); setAccessToken('expired') })
  it('shares one rotation request across concurrent 401 responses', async () => {
    let refreshCalls = 0
    let protectedCalls = 0
    server.use(
      http.get('http://localhost:8080/api/v1/protected', ({ request }) => { protectedCalls += 1; return request.headers.get('authorization') === 'Bearer access-rotated' ? HttpResponse.json({ ok: true }) : HttpResponse.json({}, { status: 401 }) }),
      http.post('http://localhost:8080/api/v1/auth/refresh', async ({ request }) => { refreshCalls += 1; await request.json(); return HttpResponse.json({ accessToken: 'access-rotated', refreshToken: 'refresh-rotated', tokenType: 'Bearer', expiresIn: 900, user: { id: 'owner', restaurantId: 'r1', restaurantCode: 'R1', restaurantName: 'R', name: 'Owner', email: 'owner@example.com', phone: null, role: 'OWNER', permissions: [] } }) }),
    )
    await Promise.all([api.get('/protected'), api.get('/protected')])
    expect(refreshCalls).toBe(1)
    expect(protectedCalls).toBe(4)
    expect(getAccessToken()).toBe('access-rotated')
  })
  it('does not refresh a business forbidden response and retries once at most', async () => {
    let refreshCalls = 0
    let calls = 0
    server.use(
      http.get('http://localhost:8080/api/v1/business-forbidden', () => { calls += 1; return HttpResponse.json({ success: false, code: 'FORBIDDEN', message: 'Access denied', fieldErrors: {}, timestamp: '' }, { status: 403 }) }),
      http.post('http://localhost:8080/api/v1/auth/refresh', () => { refreshCalls += 1; return HttpResponse.json({}, { status: 500 }) }),
    )
    await expect(api.get('/business-forbidden')).rejects.toBeTruthy()
    expect(refreshCalls).toBe(0)
    expect(calls).toBe(1)
    server.use(
      http.get('http://localhost:8080/api/v1/retry-once', () => { calls += 1; return HttpResponse.json({}, { status: 401 }) }),
      http.post('http://localhost:8080/api/v1/auth/refresh', () => { refreshCalls += 1; return HttpResponse.json({ accessToken: 'access-retry', refreshToken: 'refresh-retry', tokenType: 'Bearer', expiresIn: 900, user: { id: 'owner', restaurantId: 'r1', restaurantCode: 'R1', restaurantName: 'R', name: 'Owner', email: 'owner@example.com', phone: null, role: 'OWNER', permissions: [] } }) }),
    )
    await expect(api.get('/retry-once')).rejects.toBeTruthy()
    expect(refreshCalls).toBe(1)
    expect(calls).toBe(3)
  })
})
