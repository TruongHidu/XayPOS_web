import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import { ordersApi } from '../features/order/api/ordersApi'
import { createOrderSchema } from '../features/order/schemas'
import { paymentsApi } from '../features/payment/api/paymentsApi'
import { paymentInputSchema } from '../features/payment/schemas'
import { kitchenApi } from '../features/kitchen/api/kitchenApi'
import { kitchenCriteriaSchema } from '../features/kitchen/schemas'
import { cashierTablesApi } from '../features/tables/api/cashierTablesApi'
import { canCloseTable, canKitchen, canPayment } from '../features/order/policies/orderAccessPolicy'
import { useAuthStore } from '../features/auth/store/authStore'
import {
  base,
  ids,
  orderFixture,
  orderHandlers,
  page,
  resetOrderTest,
  seedOrderAccess,
  sessionFixture,
} from './orderFixtures'

const payment = {
  id: ids.item,
  orderId: ids.order,
  paymentCode: 'PAY-001',
  amount: 100000,
  currencyCode: 'VND',
  paymentMethod: 'TRANSFER',
  confirmationSource: 'STAFF_MANUAL',
  provider: null,
  status: 'SUCCESS',
  referenceNo: 'BANK-TXN-123456',
  requestedAt: '2026-10-13T01:00:00Z',
  paidAt: '2026-10-13T01:10:00Z',
  createdBy: ids.user,
}
describe('Cashier current API contract', () => {
  let scope: string
  beforeEach(() => {
    scope = seedOrderAccess()
    server.use(...orderHandlers)
  })
  afterEach(resetOrderTest)

  it('seating and modes validate before HTTP; legacy draft/session and staff sources remain supported', async () => {
    const input = {
      serviceType: 'DINE_IN' as const,
      sourceChannel: 'WAITER' as const,
      tableId: ids.table,
      submissionMode: 'SUBMIT' as const,
      items: [{ itemId: ids.item, quantity: 1 }],
    }
    expect(createOrderSchema.parse(input)).toEqual(input)
    const result = await ordersApi.create(scope, input, 'create-table-key')
    expect(result.order.tableSessionId).toBe(ids.session)
    expect(result.order.status).toBe('CONFIRMED')
    for (const invalid of [
      { ...input, submissionMode: undefined },
      { ...input, submissionMode: 'DRAFT' },
      { ...input, tableSessionId: ids.session },
      { ...input, serviceType: 'TAKEAWAY' },
      { ...input, tableId: undefined },
      { ...input, sourceChannel: 'QR_TABLE' },
    ])
      expect(createOrderSchema.safeParse(invalid).success).toBe(false)
    expect(
      createOrderSchema.safeParse({
        ...input,
        tableId: undefined,
        tableSessionId: ids.session,
        submissionMode: undefined,
      }).success,
    ).toBe(true)
  })

  it('active-order handles 204 without parsing and never falls back on 409', async () => {
    expect(await ordersApi.active(scope, ids.session)).toBeNull()
    server.use(http.get(base + '/table-sessions/:id/active-order', () => HttpResponse.json(orderFixture())))
    expect((await ordersApi.active(scope, ids.session))?.id).toBe(ids.order)
    server.use(
      http.get(base + '/table-sessions/:id/active-order', () =>
        HttpResponse.json({ code: 'INCONSISTENT_SERVING_ORDER_STATE' }, { status: 409 }),
      ),
    )
    await expect(ordersApi.active(scope, ids.session)).rejects.toMatchObject({ response: { status: 409 } })
  })

  it('append SUBMIT requires its own key, exact body and replay header; draft omits key', async () => {
    const calls: { body: unknown; key: string | null }[] = []
    server.use(
      http.post(base + '/orders/:id/items', async ({ request }) => {
        calls.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') })
        return HttpResponse.json(
          { ...orderFixture(), version: 8, status: 'PREPARING' },
          { headers: { 'Idempotency-Replayed': 'true' } },
        )
      }),
    )
    const input = {
      expectedVersion: 5,
      submissionMode: 'SUBMIT' as const,
      items: [{ itemId: ids.item, quantity: 2, note: 'Ít cay' }],
    }
    await expect(ordersApi.add(scope, ids.order, input)).rejects.toThrow('INVALID_IDEMPOTENCY_KEY')
    const response = await ordersApi.add(scope, ids.order, input, 'append-key')
    expect(response.replayed).toBe(true)
    expect(response.order.version).toBe(8)
    await ordersApi.add(scope, ids.order, input, 'append-key')
    expect(calls[0]).toEqual(calls[1])
    expect(calls[0]).toEqual({ body: input, key: 'append-key' })
    await ordersApi.add(scope, ids.order, { expectedVersion: 8, items: input.items })
    expect(calls[2].key).toBeNull()
  })

  it('manual payments use expectedOrderVersion, key/replay and PaymentResponse; list/detail stay separate', async () => {
    const calls: { body: unknown; key: string | null }[] = []
    let replay = false
    server.use(
      http.post(base + '/orders/:id/payments', async ({ request }) => {
        calls.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') })
        const response = HttpResponse.json(payment, {
          status: replay ? 200 : 201,
          headers: { 'Idempotency-Replayed': String(replay) },
        })
        replay = true
        return response
      }),
      http.get(base + '/orders/:id/payments', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('page')).toBe('0')
        expect(url.searchParams.get('size')).toBe('20')
        return HttpResponse.json(page([payment]))
      }),
      http.get(base + '/orders/:id/payments/:paymentId', () => HttpResponse.json(payment)),
    )
    const input = {
      expectedOrderVersion: 5,
      paymentMethod: 'TRANSFER' as const,
      amount: 100000,
      referenceNo: 'BANK-TXN-123456',
    }
    expect((await paymentsApi.record(scope, ids.order, input, 'payment-key')).replayed).toBe(false)
    const result = await paymentsApi.record(scope, ids.order, input, 'payment-key')
    expect(result.replayed).toBe(true)
    expect(result.payment).not.toHaveProperty('version')
    expect(calls[0]).toEqual({ body: input, key: 'payment-key' })
    expect(calls[1]).toEqual(calls[0])
    expect((await paymentsApi.list(scope, ids.order)).content).toHaveLength(1)
    expect((await paymentsApi.detail(scope, ids.order, payment.id)).id).toBe(payment.id)
  })

  it('payment rejects missing transfer reference, foreign body fields and invalid decimal before request', async () => {
    const input = { expectedOrderVersion: 5, paymentMethod: 'TRANSFER' as const, amount: 100000 }
    expect(paymentInputSchema.safeParse(input).success).toBe(false)
    expect(paymentInputSchema.safeParse({ ...input, referenceNo: '   ' }).success).toBe(false)
    expect(paymentInputSchema.safeParse({ ...input, paymentMethod: 'CASH' }).success).toBe(true)
    expect(paymentInputSchema.safeParse({ ...input, paymentMethod: 'CASH', restaurantId: ids.area }).success).toBe(
      false,
    )
    for (const amount of [0, -1, 0.001])
      expect(paymentInputSchema.safeParse({ ...input, paymentMethod: 'CASH', amount }).success).toBe(false)
    await expect(paymentsApi.record(scope, ids.order, { ...input, paymentMethod: 'CASH' }, '')).rejects.toThrow(
      'INVALID_IDEMPOTENCY_KEY',
    )
  })

  it('queue exposes nullable seating and root orderVersion; only three queue statuses allowed', async () => {
    const queue = {
      orderId: ids.order,
      orderCode: 'OD-001',
      orderVersion: 5,
      orderItemId: ids.line,
      itemName: 'Phở bò',
      quantity: 2,
      unit: 'tô',
      note: null,
      itemStatus: 'PENDING',
      serviceType: 'TAKEAWAY',
      createdAt: '2026-10-13T01:00:00Z',
      sentToKitchenAt: null,
      sessionId: null,
      tableId: null,
      tableCode: null,
      tableName: null,
    }
    server.use(
      http.get(base + '/kitchen/items', ({ request }) => {
        expect(new URL(request.url).searchParams.get('status')).toBe('PENDING')
        return HttpResponse.json(page([queue]))
      }),
    )
    expect((await kitchenApi.items(scope)).content[0]).toMatchObject({ orderVersion: 5, tableId: null })
    expect(kitchenCriteriaSchema.safeParse({ status: 'SERVED' }).success).toBe(false)
  })

  it('item lifecycle uses root expectedOrderVersion while complete and close use distinct versions', async () => {
    const calls: { path: string; body: unknown }[] = []
    server.use(
      http.post(base + '/orders/:id/items/:lineId/:action', async ({ request }) => {
        calls.push({ path: new URL(request.url).pathname, body: await request.json() })
        return HttpResponse.json(orderFixture())
      }),
      http.post(base + '/orders/:id/complete', async ({ request }) => {
        calls.push({ path: new URL(request.url).pathname, body: await request.json() })
        return HttpResponse.json({
          ...orderFixture(),
          status: 'COMPLETED',
          version: 10,
          completedAt: '2026-10-13T01:10:00Z',
        })
      }),
      http.post(base + '/table-sessions/:id/close', async ({ request }) => {
        calls.push({ path: new URL(request.url).pathname, body: await request.json() })
        return HttpResponse.json({ ...sessionFixture, status: 'CLOSED', version: 9, closedAt: '2026-10-13T01:10:00Z' })
      }),
    )
    await ordersApi.startCooking(scope, ids.order, ids.line, 5)
    await ordersApi.markReady(scope, ids.order, ids.line, 6)
    await ordersApi.markServed(scope, ids.order, ids.line, 7)
    expect((await ordersApi.complete(scope, ids.order, 9)).status).toBe('COMPLETED')
    expect((await cashierTablesApi.close(scope, ids.session, 8)).status).toBe('CLOSED')
    expect(calls.map((call) => call.path.split('/').at(-1))).toEqual([
      'start-cooking',
      'mark-ready',
      'mark-served',
      'complete',
      'close',
    ])
    expect(calls.map((call) => call.body)).toEqual([
      { expectedOrderVersion: 5 },
      { expectedOrderVersion: 6 },
      { expectedOrderVersion: 7 },
      { expectedVersion: 9 },
      { expectedVersion: 8 },
    ])
  })

  it('payment, kitchen and close gates depend on effective permissions and features', () => {
    expect(canPayment(useAuthStore.getState())).toBe(false)
    expect(canCloseTable(useAuthStore.getState())).toBe(false)
    expect(canKitchen(useAuthStore.getState(), 'KITCHEN_VIEW')).toBe(false)
    seedOrderAccess(
      ['PAYMENT_CREATE', 'PAYMENT_CONFIRM', 'KITCHEN_VIEW', 'TABLE_VIEW', 'TABLE_CLOSE'],
      ['PAYMENT_MANAGEMENT', 'KITCHEN_DISPLAY', 'TABLE_MANAGEMENT'],
    )
    expect(canPayment(useAuthStore.getState())).toBe(true)
    expect(canCloseTable(useAuthStore.getState())).toBe(true)
    expect(canKitchen(useAuthStore.getState(), 'KITCHEN_VIEW')).toBe(true)
    seedOrderAccess(['PAYMENT_CREATE'], ['PAYMENT_MANAGEMENT'])
    expect(canPayment(useAuthStore.getState())).toBe(false)
  })
})
