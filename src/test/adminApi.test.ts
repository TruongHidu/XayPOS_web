import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import { featuresApi } from '../features/admin/api/featuresApi'
import { packagesApi } from '../features/admin/api/packagesApi'
import { adminSubscriptionsApi } from '../features/admin/api/adminSubscriptionsApi'
import { setAccessToken } from '../shared/api/httpClient'

describe('admin API contracts', () => {
  beforeEach(() => setAccessToken('admin-token'))
  it('uses includeInactive for feature and package lists', async () => {
    const urls: string[] = []
    server.use(http.get('http://localhost:8080/api/v1/admin/features', ({ request }) => { urls.push(request.url); return HttpResponse.json([]) }), http.get('http://localhost:8080/api/v1/admin/packages', ({ request }) => { urls.push(request.url); return HttpResponse.json([]) }))
    await featuresApi.list(true)
    await packagesApi.list(false)
    expect(urls[0]).toContain('includeInactive=true')
    expect(urls[1]).toContain('includeInactive=false')
  })
  it('does not add immutable code to update request bodies', async () => {
    let featureBody: unknown
    let packageBody: unknown
    server.use(http.put('http://localhost:8080/api/v1/admin/features/ORDER_MANAGEMENT', async ({ request }) => { featureBody = await request.json(); return HttpResponse.json({}) }), http.put('http://localhost:8080/api/v1/admin/packages/PRO', async ({ request }) => { packageBody = await request.json(); return HttpResponse.json({}) }))
    await featuresApi.update('ORDER_MANAGEMENT', { name: 'Orders', description: null, active: false })
    await packagesApi.update('PRO', { name: 'Pro', description: null, priceAmount: 1, currencyCode: 'VND', billingCycleMonths: 1, active: true })
    expect(featureBody).not.toHaveProperty('code')
    expect(packageBody).not.toHaveProperty('code')
  })
  it('uses the exact subscription operation paths and DTOs', async () => {
    const requests: { method: string; url: string; body: unknown }[] = []
    server.use(
      http.post('http://localhost:8080/api/v1/admin/restaurants/:restaurantId/subscriptions/:subscriptionId/activate', async ({ request }) => { requests.push({ method: request.method, url: request.url, body: await request.text() }); return HttpResponse.json({}) }),
      http.post('http://localhost:8080/api/v1/admin/restaurants/:restaurantId/subscriptions/:subscriptionId/change-package', async ({ request }) => { requests.push({ method: request.method, url: request.url, body: await request.json() }); return HttpResponse.json({}) }),
      http.post('http://localhost:8080/api/v1/admin/restaurants/:restaurantId/subscriptions/:subscriptionId/cancel', async ({ request }) => { requests.push({ method: request.method, url: request.url, body: await request.text() }); return HttpResponse.json({}) }),
    )
    await adminSubscriptionsApi.activate('restaurant-1', 'subscription-1')
    await adminSubscriptionsApi.changePackage('restaurant-1', 'subscription-1', { packageCode: 'PRO', endAt: '2026-09-01T00:00:00Z', autoRenew: false, priceAmount: 1, currencyCode: 'VND' })
    await adminSubscriptionsApi.cancel('restaurant-1', 'subscription-1')
    expect(requests[0].url).toContain('/restaurants/restaurant-1/subscriptions/subscription-1/activate')
    expect(requests[0].body).toBe('')
    expect(requests[1].body).not.toHaveProperty('startAt')
    expect(requests[2].body).toBe('')
  })
})
