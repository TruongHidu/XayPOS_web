import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { AuthResponse, AuthUser } from '../shared/types/auth'
import type { AdminPackageResponse, AuditLogResponse, FeatureResponse, RestaurantDetailResponse, RestaurantResponse, SubscriptionResponse } from '../shared/types/admin'

export const adminUser: AuthUser = { id: 'admin-1', restaurantId: null, restaurantCode: null, restaurantName: null, name: 'System Administrator', email: 'admin@example.com', phone: null, role: 'SUPER_ADMIN', permissions: ['ADMIN_DASHBOARD_VIEW', 'PACKAGE_VIEW', 'PACKAGE_MANAGE', 'SUBSCRIPTION_VIEW', 'SUBSCRIPTION_MANAGE', 'RESTAURANT_VIEW', 'RESTAURANT_MANAGE', 'AUDIT_VIEW'] }
export const ownerUser: AuthUser = { id: 'owner-1', restaurantId: 'restaurant-1', restaurantCode: 'DEMO01', restaurantName: 'Demo Restaurant', name: 'Owner', email: 'owner@example.com', phone: null, role: 'OWNER', permissions: [] }
export const adminFeatures: FeatureResponse[] = [{ id: 'feature-1', code: 'ORDER_MANAGEMENT', name: 'Order management', description: null, active: true }, { id: 'feature-2', code: 'OLD_REPORT', name: 'Old report', description: 'Inactive feature', active: false }]
export const adminPackages: AdminPackageResponse[] = [{ id: 'package-1', code: 'PRO', name: 'Pro', description: 'Operations package', priceAmount: 399000, currencyCode: 'VND', billingCycleMonths: 1, active: true, features: [{ code: 'ORDER_MANAGEMENT', limits: {} }] }, { id: 'package-2', code: 'OLD', name: 'Old', description: null, priceAmount: 0, currencyCode: 'VND', billingCycleMonths: 1, active: false, features: [] }, { id: 'package-3', code: 'PREMIUM', name: 'Premium', description: 'Premium operations', priceAmount: 699000, currencyCode: 'VND', billingCycleMonths: 1, active: true, features: [{ code: 'ORDER_MANAGEMENT', limits: {} }] }]
export const adminSubscription: SubscriptionResponse = { id: 'subscription-1', restaurantId: 'restaurant-1', packageId: 'package-1', packageCode: 'PRO', status: 'ACTIVE', startAt: '2026-08-01T00:00:00Z', endAt: '2026-09-01T00:00:00Z', autoRenew: true, priceAmount: 399000, currencyCode: 'VND', activatedAt: '2026-08-01T00:00:00Z', cancelledAt: null, features: [{ code: 'ORDER_MANAGEMENT', limits: { ordersPerDay: 1000 } }] }
export const adminRestaurant: RestaurantResponse = { id: 'restaurant-1', code: 'DEMO01', name: 'Demo Restaurant', legalName: 'Demo Restaurant LLC', phone: '+84123456789', timezone: 'Asia/Ho_Chi_Minh', currencyCode: 'VND', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-08-27T00:00:00Z', effectiveSubscription: { id: adminSubscription.id, packageCode: adminSubscription.packageCode, status: adminSubscription.status, startAt: adminSubscription.startAt, endAt: adminSubscription.endAt, autoRenew: adminSubscription.autoRenew }, packageAssignmentState: 'ACTIVE' }
export const adminRestaurantDetail: RestaurantDetailResponse = { ...adminRestaurant, owners: [{ id: 'owner-1', name: 'Owner', email: 'owner@example.com', phone: '+84987654321', active: true }], totalUsers: 4, activeUsers: 3, latestSubscription: adminSubscription }
export const adminAuditLog: AuditLogResponse = { id: 'audit-1', createdAt: '2026-08-27T02:00:00Z', scope: 'TENANT', restaurantId: 'restaurant-1', restaurantCode: 'DEMO01', actorUserId: 'admin-1', actorName: 'System Administrator', actorEmail: 'admin@example.com', actionCode: 'RESTAURANT_STATUS_CHANGED', entityType: 'RESTAURANT', entityId: 'restaurant-1', ip: '127.0.0.1', beforeData: { status: 'INACTIVE' }, afterData: { status: 'ACTIVE', reason: '[REDACTED]' } }

const page = <T,>(content: T[], request: Request) => {
  const url = new URL(request.url)
  const pageNumber = Math.max(0, Number(url.searchParams.get('page') ?? 0) || 0)
  const size = Math.max(1, Number(url.searchParams.get('size') ?? 20) || 20)
  return { content, page: pageNumber, size, totalElements: content.length, totalPages: content.length ? 1 : 0 }
}

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
  http.get('http://localhost:8080/api/v1/admin/dashboard/summary', () => HttpResponse.json({ generatedAt: '2026-08-27T00:00:00Z', restaurants: { total: 20, active: 16, inactive: 2, suspended: 2, newLast30Days: 3, activeWithoutEffectiveSubscription: 4 }, subscriptions: { total: 30, pending: 4, activeStatus: 12, effectiveNow: 10, staleActive: 1, expired: 6, cancelled: 8, expiringWithin7Days: 2 }, packages: { total: 3, active: 3, inactive: 0 }, features: { total: 23, active: 23, inactive: 0 } })),
  http.get('http://localhost:8080/api/v1/admin/features', () => HttpResponse.json(adminFeatures)),
  http.get('http://localhost:8080/api/v1/admin/features/:featureCode', ({ params }) => HttpResponse.json(adminFeatures.find((item) => item.code === params.featureCode) ?? adminFeatures[0])),
  http.post('http://localhost:8080/api/v1/admin/features', async ({ request }) => HttpResponse.json({ id: 'feature-new', ...(await request.json() as object), active: true }, { status: 201 })),
  http.put('http://localhost:8080/api/v1/admin/features/:featureCode', async ({ params, request }) => HttpResponse.json({ ...(adminFeatures.find((item) => item.code === params.featureCode) ?? adminFeatures[0]), ...(await request.json() as object) })),
  http.get('http://localhost:8080/api/v1/admin/packages', () => HttpResponse.json(adminPackages)),
  http.get('http://localhost:8080/api/v1/admin/packages/:packageCode', ({ params }) => HttpResponse.json(adminPackages.find((item) => item.code === params.packageCode) ?? adminPackages[0])),
  http.post('http://localhost:8080/api/v1/admin/packages', async ({ request }) => HttpResponse.json({ id: 'package-new', ...(await request.json() as object), active: true, features: [] }, { status: 201 })),
  http.put('http://localhost:8080/api/v1/admin/packages/:packageCode', async ({ params, request }) => HttpResponse.json({ ...(adminPackages.find((item) => item.code === params.packageCode) ?? adminPackages[0]), ...(await request.json() as object) })),
  http.post('http://localhost:8080/api/v1/admin/packages/:packageCode/features/:featureCode', async ({ params, request }) => HttpResponse.json({ ...adminPackages[0], code: params.packageCode, features: [{ code: params.featureCode, limits: (await request.json() as { limits: Record<string, unknown> }).limits }] })),
  http.delete('http://localhost:8080/api/v1/admin/packages/:packageCode/features/:featureCode', ({ params }) => HttpResponse.json({ ...adminPackages[0], code: params.packageCode, features: [] })),
  http.get('http://localhost:8080/api/v1/admin/restaurants', ({ request }) => HttpResponse.json(page([adminRestaurant], request))),
  http.get('http://localhost:8080/api/v1/admin/restaurants/:restaurantId', () => HttpResponse.json(adminRestaurantDetail)),
  http.patch('http://localhost:8080/api/v1/admin/restaurants/:restaurantId/status', async ({ request }) => HttpResponse.json({ ...adminRestaurantDetail, ...(await request.json() as object) })),
  http.get('http://localhost:8080/api/v1/admin/subscriptions', ({ request }) => HttpResponse.json(page([{ ...adminSubscription, restaurantCode: adminRestaurant.code, restaurantName: adminRestaurant.name, restaurantStatus: adminRestaurant.status, packageName: 'Pro', effective: true, createdAt: '2026-08-01T00:00:00Z' }], request))),
  http.get('http://localhost:8080/api/v1/admin/restaurants/:restaurantId/subscriptions', ({ request }) => HttpResponse.json(page([adminSubscription], request))),
  http.get('http://localhost:8080/api/v1/admin/restaurants/:restaurantId/subscriptions/:subscriptionId', () => HttpResponse.json(adminSubscription)),
  http.get('http://localhost:8080/api/v1/admin/audit-logs', ({ request }) => HttpResponse.json(page([adminAuditLog], request))),
  http.post('http://localhost:8080/api/v1/admin/restaurants/:restaurantId/subscriptions', async ({ params, request }) => HttpResponse.json({ id: 'subscription-new', restaurantId: params.restaurantId, packageId: 'package-1', ...(await request.json() as object), status: 'PENDING', activatedAt: null, cancelledAt: null, features: [] }, { status: 201 })),
  http.post('http://localhost:8080/api/v1/admin/restaurants/:restaurantId/subscriptions/:subscriptionId/activate', ({ params }) => HttpResponse.json({ id: String(params.subscriptionId ?? ''), restaurantId: String(params.restaurantId ?? ''), packageId: 'package-1', packageCode: 'PRO', status: 'ACTIVE', startAt: '2026-08-27T00:00:00Z', endAt: '2026-09-27T00:00:00Z', autoRenew: false, priceAmount: 399000, currencyCode: 'VND', activatedAt: '2026-08-27T00:00:00Z', cancelledAt: null, features: adminFeatures.filter((item) => item.active).map((item) => ({ code: item.code, limits: {} })) } satisfies SubscriptionResponse)),
  http.post('http://localhost:8080/api/v1/admin/restaurants/:restaurantId/subscriptions/:subscriptionId/change-package', async ({ params, request }) => HttpResponse.json({ id: 'subscription-new', restaurantId: params.restaurantId, packageId: 'package-1', ...(await request.json() as object), status: 'ACTIVE', activatedAt: '2026-08-27T00:00:00Z', cancelledAt: null, features: [] })),
  http.post('http://localhost:8080/api/v1/admin/restaurants/:restaurantId/subscriptions/:subscriptionId/cancel', ({ params }) => HttpResponse.json({ id: String(params.subscriptionId ?? ''), restaurantId: String(params.restaurantId ?? ''), packageId: 'package-1', packageCode: 'PRO', status: 'CANCELLED', startAt: '2026-08-27T00:00:00Z', endAt: '2026-09-27T00:00:00Z', autoRenew: false, priceAmount: 399000, currencyCode: 'VND', activatedAt: null, cancelledAt: '2026-08-27T00:00:00Z', features: [] } satisfies SubscriptionResponse)),
]
export const server = setupServer(...handlers)
