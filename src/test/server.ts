import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { AuthResponse, AuthUser } from '../shared/types/auth'

export const adminUser: AuthUser = { id: 'admin-1', restaurantId: null, restaurantCode: null, restaurantName: null, name: 'System Administrator', email: 'admin@example.com', phone: null, role: 'SUPER_ADMIN', permissions: ['PACKAGE_VIEW', 'PACKAGE_MANAGE', 'SUBSCRIPTION_VIEW', 'SUBSCRIPTION_MANAGE'] }
export const ownerUser: AuthUser = { id: 'owner-1', restaurantId: 'restaurant-1', restaurantCode: 'DEMO01', restaurantName: 'Demo Restaurant', name: 'Owner', email: 'owner@example.com', phone: null, role: 'OWNER', permissions: [] }

const authResponse = (user: AuthUser, suffix = '1'): AuthResponse => ({ accessToken: `access-${suffix}`, refreshToken: `refresh-${suffix}`, tokenType: 'Bearer', expiresIn: 900, user })
export const handlers = [
  http.post('http://localhost:8080/api/v1/auth/login', async ({ request }) => {
    const body = await request.json() as { email?: string; password?: string }
    if (body.password !== 'correct') return HttpResponse.json({ success: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password', fieldErrors: {}, timestamp: new Date().toISOString() }, { status: 401 })
    return HttpResponse.json(authResponse(body.email?.includes('owner') ? ownerUser : adminUser))
  }),
  http.post('http://localhost:8080/api/v1/auth/refresh', async ({ request }) => {
    const body = await request.json() as { refreshToken?: string }
    if (!body.refreshToken || body.refreshToken === 'invalid') return HttpResponse.json({ success: false, code: 'INVALID_REFRESH_TOKEN', message: 'invalid', fieldErrors: {}, timestamp: new Date().toISOString() }, { status: 401 })
    return HttpResponse.json(authResponse(ownerUser, 'rotated'))
  }),
  http.get('http://localhost:8080/api/v1/me/entitlements', () => HttpResponse.json({ subscriptionId: 'sub-1', packageCode: 'PRO', status: 'ACTIVE', startAt: '2026-01-01', endAt: '2027-01-01', features: [] })),
  http.post('http://localhost:8080/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
]
export const server = setupServer(...handlers)
