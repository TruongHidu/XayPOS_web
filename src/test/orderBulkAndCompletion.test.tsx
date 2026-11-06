import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { server } from './server'
import { queryClient } from '../shared/api/queryClient'
import { ordersApi } from '../features/order/api/ordersApi'
import { OrderPanel } from '../features/order/components/OrderPanel'
import {
  canCompleteOrder,
  canMarkServed,
} from '../features/order/policies/orderAccessPolicy'
import {
  markAllReadyAllowed,
  markAllServedAllowed,
  completable,
  allLiveItemsServed,
} from '../features/order/policies/orderActionPolicy'
import { orderKeys } from '../features/order/api/orderKeys'
import {
  seedOrderAccess,
  resetOrderTest,
  orderFixture,
  orderHandlers,
  ids,
  base,
  failure,
  makeOrder,
  cashierUser,
  entitlement,
} from './orderFixtures'
import type { Order } from '../features/order/types'

function renderPanel(order: Order, onReload?: (order: Order) => void) {
  return render(
    <QueryClientProvider client={queryClient}>
      <OrderPanel order={order} onReload={onReload} />
    </QueryClientProvider>,
  )
}

describe('Order Bulk and Completion Integration Tests', () => {
  let scope: string

  beforeEach(() => {
    scope = seedOrderAccess(
      [
        'ORDER_VIEW',
        'ORDER_CREATE',
        'ORDER_UPDATE',
        'ORDER_CANCEL',
        'ORDER_MARK_SERVED',
        'ORDER_COMPLETE',
        'TABLE_VIEW',
        'TABLE_CLOSE',
        'KITCHEN_MARK_READY',
        'PAYMENT_CREATE',
        'PAYMENT_CONFIRM',
        'PAYMENT_VIEW',
      ],
      ['ORDER_MANAGEMENT', 'TABLE_MANAGEMENT', 'KITCHEN_DISPLAY', 'PAYMENT_MANAGEMENT'],
    )
    server.use(...orderHandlers)
  })

  afterEach(resetOrderTest)

  // 1. Serialize expectedOrderVersion and expectedVersion
  it('1. serializes expectedOrderVersion for mark-ready and mark-served, and expectedVersion for complete without idempotency key or restaurantId', async () => {
    const requests: { path: string; body: unknown; headers: Record<string, string> }[] = []

    server.use(
      http.post(base + '/orders/:id/mark-ready', async ({ request }) => {
        requests.push({
          path: new URL(request.url).pathname,
          body: await request.json(),
          headers: {
            authorization: request.headers.get('authorization') ?? '',
            idempotencyKey: request.headers.get('idempotency-key') ?? '',
            restaurantId: request.headers.get('x-restaurant-id') ?? '',
          },
        })
        return HttpResponse.json(orderFixture())
      }),
      http.post(base + '/orders/:id/mark-served', async ({ request }) => {
        requests.push({
          path: new URL(request.url).pathname,
          body: await request.json(),
          headers: {
            authorization: request.headers.get('authorization') ?? '',
            idempotencyKey: request.headers.get('idempotency-key') ?? '',
            restaurantId: request.headers.get('x-restaurant-id') ?? '',
          },
        })
        return HttpResponse.json(orderFixture())
      }),
      http.post(base + '/orders/:id/complete', async ({ request }) => {
        requests.push({
          path: new URL(request.url).pathname,
          body: await request.json(),
          headers: {
            authorization: request.headers.get('authorization') ?? '',
            idempotencyKey: request.headers.get('idempotency-key') ?? '',
            restaurantId: request.headers.get('x-restaurant-id') ?? '',
          },
        })
        return HttpResponse.json(orderFixture())
      }),
    )

    await ordersApi.markAllReady(scope, ids.order, 7)
    await ordersApi.markAllServed(scope, ids.order, 8)
    await ordersApi.complete(scope, ids.order, 9)

    expect(requests).toHaveLength(3)

    // mark-ready
    expect(requests[0].path).toBe(`/api/v1/orders/${ids.order}/mark-ready`)
    expect(requests[0].body).toEqual({ expectedOrderVersion: 7 })
    expect(requests[0].headers.authorization).toContain('Bearer')
    expect(requests[0].headers.idempotencyKey).toBe('')
    expect(requests[0].headers.restaurantId).toBe('')

    // mark-served
    expect(requests[1].path).toBe(`/api/v1/orders/${ids.order}/mark-served`)
    expect(requests[1].body).toEqual({ expectedOrderVersion: 8 })
    expect(requests[1].headers.idempotencyKey).toBe('')
    expect(requests[1].headers.restaurantId).toBe('')

    // complete
    expect(requests[2].path).toBe(`/api/v1/orders/${ids.order}/complete`)
    expect(requests[2].body).toEqual({ expectedVersion: 9 })
    expect(requests[2].headers.idempotencyKey).toBe('')
    expect(requests[2].headers.restaurantId).toBe('')

    // Schema validation enforces non-negative integers
    expect(() => ordersApi.markAllReady(scope, ids.order, -1)).toThrow()
    expect(() => ordersApi.markAllServed(scope, ids.order, -1)).toThrow()
    expect(() => ordersApi.complete(scope, ids.order, -1)).toThrow()
  })

  // 2. Parse direct OrderResponse without envelope
  it('2. parses direct OrderResponse and rejects when wrapped in envelope', async () => {
    const rawOrder = orderFixture()

    server.use(
      http.post(base + '/orders/:id/mark-served', () => {
        return HttpResponse.json(rawOrder, {
          headers: { 'Cache-Control': 'no-store' },
        })
      }),
    )

    const parsed = await ordersApi.markAllServed(scope, ids.order, 5)
    expect(parsed.id).toBe(rawOrder.id)
    expect(parsed.orderCode).toBe(rawOrder.orderCode)

    // When backend wraps in { success: true, data: ... }, parseTenantResponse must throw
    server.use(
      http.post(base + '/orders/:id/mark-served', () => {
        return HttpResponse.json({ success: true, data: rawOrder })
      }),
    )

    await expect(ordersApi.markAllServed(scope, ids.order, 5)).rejects.toThrow(
      'INVALID_ORDER_RESPONSE',
    )
  })

  // 3. PENDING and COOKING items do not lock bulk mark-served
  it('3. PENDING and COOKING items do not lock bulk mark-served button', async () => {
    const order = makeOrder({
      status: 'CONFIRMED',
      items: [
        { ...orderFixture().items[0], id: '11111111-1111-4111-8111-111111111111', status: 'PENDING' },
        { ...orderFixture().items[0], id: '22222222-2222-4222-8222-222222222222', status: 'COOKING' },
      ],
    })

    expect(markAllServedAllowed(order)).toBe(true)

    renderPanel(order)

    const buttons = screen.getAllByRole('button', { name: /Đã phục vụ tất cả/ })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
    expect(buttons[0]).not.toBeDisabled()
  })

  // 4. Bulk mark-served does not require kitchen permissions or kitchen features
  it('4. bulk-served does not require kitchen permissions or kitchen features', () => {
    // Only ORDER_MARK_SERVED and ORDER_MANAGEMENT
    seedOrderAccess(['ORDER_VIEW', 'ORDER_MARK_SERVED'], ['ORDER_MANAGEMENT'])

    const order = makeOrder({
      status: 'CONFIRMED',
      items: [{ ...orderFixture().items[0], status: 'PENDING' }],
    })

    expect(
      canMarkServed({
        user: { ...cashierUser, permissions: ['ORDER_VIEW', 'ORDER_MARK_SERVED'] },
        entitlement: { ...entitlement, status: 'ACTIVE' as const, features: [{ code: 'ORDER_MANAGEMENT', limits: {} }] },
        entitlementState: 'active' as const,
      }),
    ).toBe(true)

    renderPanel(order)

    const buttons = screen.getAllByRole('button', { name: /Đã phục vụ tất cả/ })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
    expect(buttons[0]).not.toBeDisabled()
  })

  // 5. Missing ORDER_MARK_SERVED or ORDER_MANAGEMENT hides bulk mark-served
  it('5. missing ORDER_MARK_SERVED or ORDER_MANAGEMENT hides bulk mark-served button', () => {
    const order = makeOrder({
      status: 'CONFIRMED',
      items: [{ ...orderFixture().items[0], status: 'PENDING' }],
    })

    // Missing ORDER_MARK_SERVED
    seedOrderAccess(['ORDER_VIEW'], ['ORDER_MANAGEMENT'])
    const { unmount } = renderPanel(order)
    expect(screen.queryByRole('button', { name: /Đã phục vụ tất cả/ })).toBeNull()
    unmount()

    // Missing ORDER_MANAGEMENT
    seedOrderAccess(['ORDER_VIEW', 'ORDER_MARK_SERVED'], ['TABLE_MANAGEMENT'])
    renderPanel(order)
    expect(screen.queryByRole('button', { name: /Đã phục vụ tất cả/ })).toBeNull()
  })

  // 6. CANCELLED items are ignored from bulk/complete conditions
  it('6. CANCELLED items are ignored from bulk and complete conditions', () => {
    // 1 CANCELLED, 1 READY -> markAllServedAllowed is true
    const order1 = makeOrder({
      status: 'PREPARING',
      items: [
        { ...orderFixture().items[0], id: '11111111-1111-4111-8111-111111111111', status: 'CANCELLED' },
        { ...orderFixture().items[0], id: '22222222-2222-4222-8222-222222222222', status: 'READY' },
      ],
    })
    expect(markAllServedAllowed(order1)).toBe(true)

    // All CANCELLED -> none allowed
    const orderAllCancelled = makeOrder({
      status: 'PREPARING',
      items: [
        { ...orderFixture().items[0], status: 'CANCELLED' },
      ],
    })
    expect(markAllServedAllowed(orderAllCancelled)).toBe(false)
    expect(markAllReadyAllowed(orderAllCancelled)).toBe(false)
    expect(completable(orderAllCancelled)).toBe(false)

    // 1 CANCELLED, 1 SERVED, PAID -> completable is true
    const orderPaidWithCancelled = makeOrder({
      status: 'SERVED',
      paymentStatus: 'PAID',
      paidAmount: 100000,
      totalAmount: 100000,
      items: [
        { ...orderFixture().items[0], id: '11111111-1111-4111-8111-111111111111', status: 'CANCELLED' },
        { ...orderFixture().items[0], id: '22222222-2222-4222-8222-222222222222', status: 'SERVED' },
      ],
    })
    expect(completable(orderPaidWithCancelled)).toBe(true)

    // 1 CANCELLED, 1 COOKING -> markAllReadyAllowed is true
    const orderCookingWithCancelled = makeOrder({
      status: 'PREPARING',
      items: [
        { ...orderFixture().items[0], id: '11111111-1111-4111-8111-111111111111', status: 'CANCELLED' },
        { ...orderFixture().items[0], id: '22222222-2222-4222-8222-222222222222', status: 'COOKING' },
      ],
    })
    expect(markAllReadyAllowed(orderCookingWithCancelled)).toBe(true)
  })

  // 7. Orders in OPEN, COMPLETED, or CANCELLED do not have bulk actions
  it('7. OPEN, COMPLETED and CANCELLED orders do not allow bulk actions', () => {
    for (const status of ['OPEN', 'COMPLETED', 'CANCELLED'] as const) {
      const order = makeOrder({
        status,
        items: [{ ...orderFixture().items[0], status: 'COOKING' }],
      })
      expect(markAllReadyAllowed(order)).toBe(false)
      expect(markAllServedAllowed(order)).toBe(false)

      const { unmount } = renderPanel(order)
      expect(screen.queryByRole('button', { name: /Sẵn sàng tất cả/ })).toBeNull()
      expect(screen.queryByRole('button', { name: /Đã phục vụ tất cả/ })).toBeNull()
      unmount()
    }
  })

  // 8. All live items SERVED hides bulk actions and displays served badge
  it('8. when all live items are SERVED, bulk actions are hidden and served badge is shown', () => {
    const order = makeOrder({
      status: 'SERVED',
      items: [
        { ...orderFixture().items[0], id: '11111111-1111-4111-8111-111111111111', status: 'SERVED' },
        { ...orderFixture().items[0], id: '22222222-2222-4222-8222-222222222222', status: 'CANCELLED' },
      ],
    })

    expect(allLiveItemsServed(order)).toBe(true)
    expect(markAllServedAllowed(order)).toBe(false)
    expect(markAllReadyAllowed(order)).toBe(false)

    renderPanel(order)

    expect(screen.queryByRole('button', { name: /Đã phục vụ tất cả/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Sẵn sàng tất cả/ })).toBeNull()
    expect(screen.getByText('✓ Đã phục vụ đủ món')).toBeInTheDocument()
  })

  // 9. Bulk mark-ready is blocked when any active item is PENDING
  it('9. bulk mark-ready is blocked when any active item is PENDING', () => {
    // 1 COOKING and 1 PENDING -> markAllReadyAllowed is false
    const orderWithPending = makeOrder({
      status: 'PREPARING',
      items: [
        { ...orderFixture().items[0], id: '11111111-1111-4111-8111-111111111111', status: 'COOKING' },
        { ...orderFixture().items[0], id: '22222222-2222-4222-8222-222222222222', status: 'PENDING' },
      ],
    })
    expect(markAllReadyAllowed(orderWithPending)).toBe(false)

    const { unmount } = renderPanel(orderWithPending)
    expect(screen.queryByRole('button', { name: /Sẵn sàng tất cả/ })).toBeNull()
    unmount()

    // 1 COOKING and 0 PENDING -> markAllReadyAllowed is true
    const orderWithoutPending = makeOrder({
      status: 'PREPARING',
      items: [
        { ...orderFixture().items[0], id: '11111111-1111-4111-8111-111111111111', status: 'COOKING' },
      ],
    })
    expect(markAllReadyAllowed(orderWithoutPending)).toBe(true)
    renderPanel(orderWithoutPending)
    expect(screen.getAllByRole('button', { name: /Sẵn sàng tất cả/ }).length).toBeGreaterThanOrEqual(1)
  })

  // 10. Complete is blocked when unpaid or items not SERVED
  it('10. complete is blocked when order is not fully paid or items not SERVED', () => {
    // Unpaid
    const orderUnpaid = makeOrder({
      status: 'SERVED',
      paymentStatus: 'UNPAID',
      paidAmount: 0,
      totalAmount: 100000,
      items: [{ ...orderFixture().items[0], status: 'SERVED' }],
    })
    expect(completable(orderUnpaid)).toBe(false)

    // Partially paid
    const orderPartiallyPaid = makeOrder({
      status: 'SERVED',
      paymentStatus: 'PAID',
      paidAmount: 50000,
      totalAmount: 100000,
      items: [{ ...orderFixture().items[0], status: 'SERVED' }],
    })
    expect(completable(orderPartiallyPaid)).toBe(false)

    // Fully paid but item is READY (not SERVED)
    const orderNotServed = makeOrder({
      status: 'READY',
      paymentStatus: 'PAID',
      paidAmount: 100000,
      totalAmount: 100000,
      items: [{ ...orderFixture().items[0], status: 'READY' }],
    })
    expect(completable(orderNotServed)).toBe(false)

    // Fully paid and all SERVED -> completable is true
    const orderCompleteReady = makeOrder({
      status: 'SERVED',
      paymentStatus: 'PAID',
      paidAmount: 100000,
      totalAmount: 100000,
      items: [{ ...orderFixture().items[0], status: 'SERVED' }],
    })
    expect(completable(orderCompleteReady)).toBe(true)
  })

  // 11. Complete DINE_IN checks TABLE_CLOSE and TABLE_MANAGEMENT
  it('11. complete DINE_IN strictly requires TABLE_CLOSE and TABLE_MANAGEMENT', () => {
    // TAKEAWAY only needs ORDER_COMPLETE and ORDER_MANAGEMENT
    seedOrderAccess(['ORDER_VIEW', 'ORDER_COMPLETE'], ['ORDER_MANAGEMENT'])
    const accessWithoutTables = {
      user: { ...cashierUser, role: 'CASHIER' as const, permissions: ['ORDER_VIEW', 'ORDER_COMPLETE'] },
      entitlement: { ...entitlement, status: 'ACTIVE' as const, features: [{ code: 'ORDER_MANAGEMENT', limits: {} }] },
      entitlementState: 'active' as const,
    }

    expect(canCompleteOrder(accessWithoutTables, 'TAKEAWAY')).toBe(true)
    expect(canCompleteOrder(accessWithoutTables, 'DINE_IN')).toBe(false)

    // With TABLE_CLOSE but missing TABLE_MANAGEMENT feature
    const accessMissingTableFeature = {
      ...accessWithoutTables,
      user: { ...accessWithoutTables.user, permissions: ['ORDER_VIEW', 'ORDER_COMPLETE', 'TABLE_CLOSE'] },
    }
    expect(canCompleteOrder(accessMissingTableFeature, 'DINE_IN')).toBe(false)

    // With TABLE_MANAGEMENT feature but missing TABLE_CLOSE permission
    const accessMissingTablePerm = {
      user: { ...accessWithoutTables.user, permissions: ['ORDER_VIEW', 'ORDER_COMPLETE'] },
      entitlement: {
        status: 'ACTIVE' as const,
        features: [{ code: 'ORDER_MANAGEMENT', limits: {} }, { code: 'TABLE_MANAGEMENT', limits: {} }],
      } as any,
      entitlementState: 'active' as const,
    }
    expect(canCompleteOrder(accessMissingTablePerm, 'DINE_IN')).toBe(false)

    // With both TABLE_CLOSE and TABLE_MANAGEMENT
    const fullAccess = {
      user: { ...accessWithoutTables.user, permissions: ['ORDER_VIEW', 'ORDER_COMPLETE', 'TABLE_CLOSE'] },
      entitlement: {
        status: 'ACTIVE' as const,
        features: [{ code: 'ORDER_MANAGEMENT', limits: {} }, { code: 'TABLE_MANAGEMENT', limits: {} }],
      } as any,
      entitlementState: 'active' as const,
    }
    expect(canCompleteOrder(fullAccess, 'DINE_IN')).toBe(true)
  })

  // 12. DINE_IN complete refreshes tables/sessions and does NOT call close session API
  it('12. after complete DINE_IN succeeds, invalidates tables/sessions query cache and does NOT call close session API', async () => {
    const user = userEvent.setup()
    let completeCalled = false
    let sessionCloseCalled = false

    server.use(
      http.post(base + '/orders/:id/complete', () => {
        completeCalled = true
        return HttpResponse.json(
          makeOrder({
            serviceType: 'DINE_IN',
            tableSessionId: ids.session,
            status: 'COMPLETED',
            paymentStatus: 'PAID',
            paidAmount: 100000,
            totalAmount: 100000,
            version: 10,
            items: [{ ...orderFixture().items[0], status: 'SERVED' }],
          }),
        )
      }),
      http.post(base + '/table-sessions/:id/close', () => {
        sessionCloseCalled = true
        return HttpResponse.json({})
      }),
    )

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const dineInOrder = makeOrder({
      serviceType: 'DINE_IN',
      tableSessionId: ids.session,
      status: 'SERVED',
      paymentStatus: 'PAID',
      paidAmount: 100000,
      totalAmount: 100000,
      version: 9,
      items: [{ ...orderFixture().items[0], status: 'SERVED' }],
    })

    renderPanel(dineInOrder)

    const completeBtn = screen.getByRole('button', { name: /Hoàn tất đơn/ })
    await user.click(completeBtn)

    await waitFor(() => {
      expect(completeCalled).toBe(true)
    })

    // Crucial check: close session API was NEVER called by frontend
    expect(sessionCloseCalled).toBe(false)

    // Table and session queries were invalidated
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: orderKeys.tables(scope) }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: orderKeys.sessions(scope) }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: orderKeys.activeOrders(scope) }),
    )
  })

  // 13. Timeout/conflict does not auto-increment version or retry in a loop
  it('13. conflict 409 reloads order detail and does NOT auto-increment version or retry', async () => {
    const user = userEvent.setup()
    let completeAttempts = 0
    let detailFetches = 0

    const updatedBackendOrder = makeOrder({
      status: 'SERVED',
      paymentStatus: 'PAID',
      paidAmount: 100000,
      totalAmount: 100000,
      version: 15,
      items: [{ ...orderFixture().items[0], status: 'SERVED' }],
    })

    server.use(
      http.post(base + '/orders/:id/complete', () => {
        completeAttempts++
        return failure('CONCURRENT_ORDER_UPDATE', 409)
      }),
      http.get(base + '/orders/:id', () => {
        detailFetches++
        return HttpResponse.json(updatedBackendOrder)
      }),
    )

    const order = makeOrder({
      status: 'SERVED',
      paymentStatus: 'PAID',
      paidAmount: 100000,
      totalAmount: 100000,
      version: 9,
      items: [{ ...orderFixture().items[0], status: 'SERVED' }],
    })

    renderPanel(order)

    const completeBtn = screen.getByRole('button', { name: /Hoàn tất đơn/ })
    await user.click(completeBtn)

    // Waited for conflict error to show
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Đơn đã được cập nhật. Giữ bản đang nhập và tải lại để đối chiếu.',
      )
    })

    // Attempted exactly once, reload was called, but did NOT auto-retry complete with v15!
    expect(completeAttempts).toBe(1)
    expect(detailFetches).toBeGreaterThanOrEqual(1)
  })

  // 14. Action buttons disable during in-flight, show loading text, and errors do not create fake success
  it('14. action buttons are disabled during loading and errors do not create fake success state', async () => {
    const user = userEvent.setup()

    server.use(
      http.post(base + '/orders/:id/mark-served', async () => {
        await delay(100)
        return failure('INTERNAL_ERROR', 500)
      }),
    )

    const order = makeOrder({
      status: 'CONFIRMED',
      items: [{ ...orderFixture().items[0], status: 'COOKING' }],
    })

    renderPanel(order)

    const bulkBtns = screen.getAllByRole('button', { name: /Đã phục vụ tất cả/ })
    await user.click(bulkBtns[0])

    // In-flight state: text shows loading and buttons are disabled
    await waitFor(() => {
      const loadingBtns = screen.getAllByRole('button', { name: /Đang xử lý\.\.\./ })
      expect(loadingBtns.length).toBeGreaterThanOrEqual(1)
      expect(loadingBtns[0]).toBeDisabled()
    })

    // After failure: error is shown, order is NOT marked as served
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // No fake success badge
    expect(screen.queryByText('✓ Đã phục vụ đủ món')).toBeNull()
  })
})
