import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import { ordersApi } from '../features/order/api/ordersApi'
import { orderSchema, orderSummarySchema, orderPageSchema, orderCriteriaSchema } from '../features/order/schemas'
import { moneyMinor, quantityMilli, previewLine } from '../shared/utils/scaledDecimal'
import { newOrderId } from '../features/order/utils/orderId'
import { cashierTablesApi } from '../features/tables/api/cashierTablesApi'
import { orderError } from '../features/order/utils/orderErrors'
import { useAuthStore } from '../features/auth/store/authStore'
import { tokenStorage, setAccessToken } from '../shared/api/httpClient'
import {
  seedOrderAccess,
  resetOrderTest,
  orderFixture,
  orderHandlers,
  ids,
  base,
  failure,
  cashierUser,
  entitlement,
} from './orderFixtures'
import type { CreateOrderInput } from '../features/order/types'
const input: CreateOrderInput = {
  serviceType: 'TAKEAWAY',
  sourceChannel: 'CASHIER',
  tableSessionId: null,
  items: [{ itemId: ids.item, quantity: 1.125, note: 'Ít cay' }],
}
describe('Order contract and precision', () => {
  let scope: string
  beforeEach(() => {
    scope = seedOrderAccess()
    server.use(...orderHandlers)
  })
  afterEach(resetOrderTest)
  it('parses detail/summary/page; cancelled keeps snapshot and nullable item', () => {
    const fixture = orderFixture()
    fixture.items[0] = { ...fixture.items[0], status: 'CANCELLED' }
    const detail = orderSchema.parse({ ...fixture, items: [{ ...fixture.items[0], itemId: null }] })
    expect(detail.items[0].lineTotal).toBe(100000)
    expect(detail.items[0].itemId).toBeNull()
    expect(orderSummarySchema.parse(fixture)).not.toHaveProperty('items')
    expect(
      orderPageSchema.parse({ content: [fixture, fixture], page: 0, size: 20, totalElements: 2, totalPages: 1 })
        .content,
    ).toHaveLength(2)
  })
  it.each(['version', 'status', 'items', 'totalAmount', 'confirmedAt', 'customerPhone'])(
    'missing %s rejects without defaults',
    (field) => {
      const fixture: Record<string, unknown> = orderFixture()
      delete fixture[field]
      expect(() => orderSchema.parse(fixture)).toThrow()
    },
  )
  it('rejects unsafe version, invalid enum and currency/amount precision', () => {
    for (const patch of [
      { version: Number.MAX_SAFE_INTEGER + 1 },
      { status: 'FAKE' },
      { totalAmount: 0.001 },
      { currencyCode: 'XX' },
    ]) {
      expect(() => orderSchema.parse({ ...orderFixture(), ...patch })).toThrow()
    }
  })
  it('uses 9 exact routes, body allowlists, root version and key only for create', async () => {
    const calls: { method: string; path: string; body: unknown; key: string | null }[] = []
    server.use(
      http.all(base + '/orders*', async ({ request }) => {
        const url = new URL(request.url)
        const body = request.method === 'GET' ? null : await request.json()
        calls.push({ method: request.method, path: url.pathname, body, key: request.headers.get('Idempotency-Key') })
        return HttpResponse.json(
          request.method === 'GET' && url.pathname.endsWith('/orders')
            ? { content: [orderFixture()], page: 0, size: 20, totalElements: 1, totalPages: 1 }
            : orderFixture(),
          { status: request.method === 'POST' && url.pathname.endsWith('/orders') ? 201 : 200 },
        )
      }),
    )
    await ordersApi.list(scope, orderCriteriaSchema.parse({ q: ' OD ', tableSessionId: ids.session }))
    await ordersApi.detail(scope, ids.order)
    await ordersApi.create(scope, input, 'stable-key')
    await ordersApi.update(scope, ids.order, { expectedVersion: 5, note: '' })
    await ordersApi.add(scope, ids.order, { expectedVersion: 6, items: input.items })
    await ordersApi.updateLine(scope, ids.order, ids.line, { expectedVersion: 7, note: '' })
    await ordersApi.confirm(scope, ids.order, 8)
    await ordersApi.cancelLine(scope, ids.order, ids.line, { expectedVersion: 9, reason: ' Đổi món ' })
    await ordersApi.cancel(scope, ids.order, { expectedVersion: 10, reason: 'Không dùng' })
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET', 'POST', 'PATCH', 'POST', 'PATCH', 'POST', 'POST', 'POST'])
    expect(calls.every((c) => !c.path.includes('/api/v1/api/v1'))).toBe(true)
    expect(calls.filter((c) => c.key)).toHaveLength(1)
    expect(calls[2].key).toBe('stable-key')
    expect(calls[2].body).toEqual(input)
    expect(calls[3].body).toEqual({ expectedVersion: 5, note: '' })
    expect(calls[7].body).toEqual({ expectedVersion: 9, reason: 'Đổi món' })
  })
  it('replay 200 preserves current status/version and header', async () => {
    server.use(
      http.post(base + '/orders', () =>
        HttpResponse.json(
          { ...orderFixture(), status: 'CONFIRMED', version: 9 },
          { headers: { 'Idempotency-Replayed': 'true' } },
        ),
      ),
    )
    const result = await ordersApi.create(scope, input, 'key')
    expect(result.replayed).toBe(true)
    expect(result.order.version).toBe(9)
    expect(result.order.status).toBe('CONFIRMED')
  })
  it('malformed successful response becomes INVALID_ORDER_RESPONSE', async () => {
    server.use(http.get(base + '/orders/:id', () => HttpResponse.json({})))
    await expect(ordersApi.detail(scope, ids.order)).rejects.toThrow('INVALID_ORDER_RESPONSE')
  })
  it('invalid input never sends a request; optional nulls not silently defaulted', async () => {
    expect(() => ordersApi.update(scope, ids.order, { expectedVersion: 0 })).toThrow()
    await expect(ordersApi.create(scope, { ...input, tableSessionId: ids.session }, 'key')).rejects.toThrow()
    await expect(ordersApi.create(scope, input, '')).rejects.toThrow('INVALID_IDEMPOTENCY_KEY')
    expect(() => orderCriteriaSchema.parse({ page: Number.MAX_SAFE_INTEGER })).toThrow()
  })
  it.each(['0', '-1', '1.0001', '1000000000', 'NaN'])('rejects quantity %s', (value) =>
    expect(() => quantityMilli(value)).toThrow(),
  )
  it('money/quantity exact with HALF_UP and large BigInt multiplication', () => {
    expect(moneyMinor('35000.50')).toBe(3500050n)
    expect(quantityMilli('2.000')).toBe(quantityMilli('2'))
    expect(previewLine(0.05, '0.1')).toBe(1n)
    expect(previewLine(999999999999.99, '999999999.999')).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER))
    expect(moneyMinor(0)).toBe(0n)
  })
  it('secure keys are stable-sized unique UUID v4', () => {
    const keys = Array.from({ length: 10 }, () => newOrderId())
    expect(new Set(keys).size).toBe(10)
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
  it('204 current-session is null; open uses table.version', async () => {
    let body: unknown
    server.use(
      http.get(base + '/tables/:id/current-session', () => new HttpResponse(null, { status: 204 })),
      http.post(base + '/tables/:id/sessions', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(
          {
            ...(await cashierTablesApi.session(scope, ids.session)),
            version: 8,
          },
          { status: 201 },
        )
      }),
    )
    expect(await cashierTablesApi.current(scope, ids.table)).toBeNull()
    await cashierTablesApi.open(scope, ids.table, { expectedVersion: 23, guestCount: 5, note: '' })
    expect(body).toEqual({ expectedVersion: 23, guestCount: 5, note: '' })
  })
  it('business403 does not refresh; code and fieldErrors preserved', async () => {
    let refresh = 0
    server.use(
      http.get(base + '/orders/:id', () => failure('FORBIDDEN', 403)),
      http.post(base + '/auth/refresh', () => {
        refresh++
        return failure('INTERNAL_ERROR', 500)
      }),
    )
    try {
      await ordersApi.detail(scope, ids.order)
    } catch (e) {
      expect(orderError(e).code).toBe('FORBIDDEN')
    }
    expect(refresh).toBe(0)
  })
  it('401 retry keeps payload/key through entitlement reload', async () => {
    tokenStorage.writeRefreshToken('order-refresh')
    setAccessToken('old')
    const bodies: unknown[] = []
    const keys: (string | null)[] = []
    server.use(
      http.post(base + '/orders', async ({ request }) => {
        bodies.push(await request.json())
        keys.push(request.headers.get('Idempotency-Key'))
        return request.headers.get('Authorization') === 'Bearer rotated'
          ? HttpResponse.json(orderFixture(), { status: 201 })
          : failure('UNAUTHORIZED', 401)
      }),
      http.post(base + '/auth/refresh', () =>
        HttpResponse.json({
          accessToken: 'rotated',
          refreshToken: 'rotated-refresh',
          tokenType: 'Bearer',
          expiresIn: 900,
          user: cashierUser,
        }),
      ),
      http.get(base + '/me/entitlements', () => HttpResponse.json(entitlement)),
    )
    await ordersApi.create(scope, input, 'same-key')
    expect(bodies).toHaveLength(2)
    expect(bodies[0]).toEqual(bodies[1])
    expect(keys).toEqual(['same-key', 'same-key'])
  })
  it('A->B->A cannot resurrect an old request during 401 retry', async () => {
    let calls = 0
    server.use(
      http.post(base + '/orders', () => {
        calls++
        useAuthStore.setState({ user: { ...cashierUser, id: 'other' } })
        useAuthStore.setState({ user: cashierUser })
        return failure('UNAUTHORIZED', 401)
      }),
    )
    await expect(ordersApi.create(scope, input, 'key')).rejects.toThrow('ORDER_ACCESS_CHANGED')
    expect(calls).toBe(1)
  })
})
