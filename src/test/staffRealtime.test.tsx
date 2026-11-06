import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import App from '../App'
import { StaffRealtimeBoundary } from '../portals/cashier/StaffRealtimeBoundary'
import { RealtimeRuntime } from '../shared/realtime/runtime'
import { channels } from '../shared/realtime/channelPolicy'
import { api, refreshWithCoordinator, setAccessToken, tokenStorage } from '../shared/api/httpClient'
import { env } from '../shared/config/env'
import { queryClient } from '../shared/api/queryClient'
import { useAuthStore } from '../features/auth/store/authStore'
import { useOrderDraftStore } from '../features/order/store/orderDraftStore'
import { operationKey, useOrderOperationState } from '../features/order/store/orderOperationState'
import { OrderDetailModal } from '../features/order/components/OrderDetailModal'
import { OrderAddItems } from '../features/order/components/OrderAddItems'
import { OrderEditor } from '../features/order/components/OrderEditor'
import { PaymentModal } from '../features/payment/components/PaymentModal'
import { QrReviewModal } from '../features/qr-order-review/components/QrReviewModal'
import { useQrReviewQueue } from '../features/qr-order-review/hooks/useQrReview'
import { orderKeys } from '../features/order/api/orderKeys'
import { qrReviewKeys } from '../features/qr-order-review/api/qrReviewKeys'
import { orderCriteriaSchema } from '../features/order/schemas'
import { useOrders } from '../features/order/hooks/useOrders'
import { useOrderDetail } from '../features/order/hooks/useOrderDetail'
import { orderScope } from '../features/order/policies/orderAccessPolicy'
import { kitchenApi } from '../features/kitchen/api/kitchenApi'
import { server, adminUser } from './server'
import {
  base,
  cashierUser,
  entitlement,
  failure,
  ids,
  itemFixture,
  makeOrder,
  orderHandlers,
  page,
  resetOrderTest,
  seedOrderAccess,
} from './orderFixtures'
import { reviewDetail, reviewId, reviewSummary } from './qrReviewFixtures'
import { deferred, FakeTransportFactory, orderEvent, qrEvent, settle } from './realtimeFixtures'

let fake: FakeTransportFactory
let runtime: RealtimeRuntime
let scope: string
const originalEnabled = env.realtimeEnabled
beforeEach(() => {
  scope = seedOrderAccess()
  fake = new FakeTransportFactory()
  runtime = new RealtimeRuntime(fake.factory, () => 0.5)
  env.realtimeEnabled = true
  server.use(
    ...orderHandlers,
    http.get(base + '/qr-order-requests/:id', () => HttpResponse.json(reviewDetail())),
  )
})
afterEach(async () => {
  cleanup()
  runtime.stop()
  await settle()
  resetOrderTest()
  env.realtimeEnabled = originalEnabled
  vi.restoreAllMocks()
  vi.useRealTimers()
})
function tree(ui: ReactNode, enabled = true) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StaffRealtimeBoundary runtime={runtime} enabled={enabled}>
          {ui}
        </StaffRealtimeBoundary>
      </MemoryRouter>
    </QueryClientProvider>
  )
}
async function mountConnected(ui: ReactNode) {
  const view = render(tree(null))
  await waitFor(() => expect(fake.clients).toHaveLength(1))
  act(() => fake.latest.connect())
  view.rerender(tree(ui))
  return view
}
function Queue() {
  const result = useQrReviewQueue({ page: 0, size: 20, status: 'PENDING', includeExpired: false })
  return <span aria-label="QR badge">{result.data?.totalElements ?? 0}</span>
}
function List() {
  const result = useOrders(orderCriteriaSchema.parse({ page: 2, q: 'phở', status: 'CONFIRMED' }))
  return (
    <div>
      {result.data?.content.map((order) => (
        <span key={order.id}>{order.orderCode}</span>
      ))}
    </div>
  )
}
describe('Staff realtime composition and lifecycle', () => {
  it('StrictMode cleanup/remount waits for physical close and does not duplicate subscriptions', async () => {
    const view = render(<StrictMode>{tree(<Queue />)}</StrictMode>)
    await waitFor(() => expect(fake.clients.length).toBeGreaterThan(0))
    act(() => fake.latest.connect())
    expect(fake.maxLive).toBe(1)
    expect(fake.latest.subscriptions.size).toBe(2)
    const gate = deferred<void>()
    fake.latest.closeGate = gate.promise
    view.unmount()
    render(tree(<Queue />))
    await act(settle)
    expect(fake.maxLive).toBe(1)
    gate.resolve()
    await act(settle)
    expect(fake.live).toBe(1)
    expect(fake.maxLive).toBe(1)
  })
  it('cashier child navigation keeps the same physical connection', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/cashier/dashboard']}>
          <App realtimeRuntime={runtime} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(fake.clients).toHaveLength(1))
    act(() => fake.latest.connect())
    await user.click(screen.getByRole('link', { name: /Đơn hàng/ }))
    await screen.findByRole('region', { name: 'Chờ xử lý' })
    expect(fake.clients).toHaveLength(1)
    expect(fake.maxLive).toBe(1)
  })
  it.each([
    '/login',
    '/admin/dashboard',
    '/qr/abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE',
    '/menu/abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE',
    '/qr/abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE/requests/' + reviewId,
  ])('never opens a staff socket on %s', async (route) => {
    const publicRoute = route.startsWith('/qr/') || route.startsWith('/menu/')
    if (route === '/login') useAuthStore.getState().clearSession()
    if (route.startsWith('/admin/'))
      useAuthStore.setState({ user: adminUser, entitlement: null, entitlementState: 'idle' })
    const staffCalls = vi.fn()
    server.use(
      http.get(base + '/auth/me', () => {
        staffCalls()
        return HttpResponse.json(cashierUser)
      }),
      http.post(base + '/auth/refresh', () => {
        staffCalls()
        return new HttpResponse(null, { status: 401 })
      }),
      http.get(base + '/me/entitlements', () => {
        staffCalls()
        return HttpResponse.json(entitlement)
      }),
      http.get(base + '/public/*', () => new HttpResponse(null, { status: 404 })),
      http.post(base + '/public/*', () => new HttpResponse(null, { status: 404 })),
    )
    if (publicRoute) tokenStorage.writeRefreshToken('previous-staff-session')
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <App realtimeRuntime={runtime} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await act(settle)
    expect(fake.clients).toHaveLength(0)
    if (publicRoute) expect(staffCalls).not.toHaveBeenCalled()
  })
  it('disabled runtime preserves REST queue and never opens a transport', async () => {
    server.use(http.get(base + '/qr-order-requests', () => HttpResponse.json(page([reviewSummary()]))))
    render(tree(<Queue />, false))
    await waitFor(() => expect(screen.getByLabelText('QR badge')).toHaveTextContent('1'))
    expect(fake.clients).toHaveLength(0)
  })
  it('refresh token notification reconnects without clearing draft, busy or uncertain intent', async () => {
    await mountConnected(<Queue />)
    useOrderDraftStore.getState().start({ serviceType: 'TAKEAWAY', tableSessionId: null, guestCount: 1 })
    useOrderDraftStore.getState().add({ ...itemFixture, availabilityStatus: 'AVAILABLE' })
    useOrderDraftStore.getState().fields({ note: 'giữ ghi chú' })
    const key = operationKey(scope, ids.order)
    const appends = new Map([
      [
        key,
        {
          orderId: ids.order,
          key: 'fixed-idempotency',
          input: { expectedVersion: 5, submissionMode: 'SUBMIT' as const, items: [{ itemId: ids.item, quantity: 1 }] },
        },
      ],
    ])
    useOrderOperationState.setState({
      busy: new Set([key]),
      uncertain: new Set([key]),
      refusals: new Map([[key, { code: 'FORBIDDEN', message: '', fieldErrors: {}, isNetworkError: false }]]),
      appends,
    })
    act(() => {
      fake.latest.emit('orders', orderEvent())
      setAccessToken('rotated-access')
    })
    await waitFor(() => expect(fake.clients).toHaveLength(2))
    expect(fake.latest.config.connectHeaders?.Authorization).toBe('Bearer rotated-access')
    expect(fake.maxLive).toBe(1)
    expect(useOrderDraftStore.getState().lines).toHaveLength(1)
    expect(useOrderDraftStore.getState().metadata.note).toBe('giữ ghi chú')
    expect(useOrderOperationState.getState().appends).toBe(appends)
    expect(useOrderOperationState.getState().busy.has(key)).toBe(true)
    expect(useOrderOperationState.getState().uncertain.has(key)).toBe(true)
    expect(useOrderOperationState.getState().refusals.has(key)).toBe(true)
  })
  it('REST 401 and socket expiry share the same refresh request', async () => {
    await mountConnected(null)
    tokenStorage.writeRefreshToken('refresh-old')
    const gate = deferred<void>()
    let refreshes = 0
    server.use(
      http.get(base + '/protected-realtime', ({ request }) =>
        request.headers.get('Authorization') === 'Bearer rotated'
          ? HttpResponse.json({ ok: true })
          : new HttpResponse(null, { status: 401 }),
      ),
      http.post(base + '/auth/refresh', async () => {
        refreshes++
        await gate.promise
        return HttpResponse.json({
          accessToken: 'rotated',
          refreshToken: 'refresh-new',
          tokenType: 'Bearer',
          expiresIn: 900,
          user: cashierUser,
        })
      }),
      http.get(base + '/me/entitlements', () => HttpResponse.json(entitlement)),
    )
    const rest = api.get('/protected-realtime')
    await waitFor(() => expect(refreshes).toBe(1))
    act(() => fake.latest.close(1008, 'TOKEN_EXPIRED'))
    gate.resolve()
    await rest
    await waitFor(() => expect(fake.clients).toHaveLength(2))
    expect(refreshes).toBe(1)
    expect(fake.latest.config.connectHeaders?.Authorization).toBe('Bearer rotated')
  })
  it('late refresh cannot resurrect a signed-out session or clear a new session', async () => {
    tokenStorage.writeRefreshToken('old')
    const gate = deferred<void>()
    const called = vi.fn()
    server.use(
      http.post(base + '/auth/refresh', async () => {
        called()
        await gate.promise
        return HttpResponse.json({
          accessToken: 'stale',
          refreshToken: 'stale',
          tokenType: 'Bearer',
          expiresIn: 900,
          user: cashierUser,
        })
      }),
    )
    const refresh = refreshWithCoordinator().catch((error) => error)
    await waitFor(() => expect(called).toHaveBeenCalled())
    useAuthStore.getState().clearSession()
    scope = seedOrderAccess()
    gate.resolve()
    await refresh
    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(orderScope(useAuthStore.getState())).toBe(scope)
    expect(tokenStorage.readRefreshToken()).toBeNull()
  })
  it('old frames are ignored after logout/login to the same account and then a different account', async () => {
    await mountConnected(null)
    const oldCallback = fake.latest.subscriptions.get(channels.orders)!.callback
    act(() => {
      useAuthStore.getState().clearSession()
      scope = seedOrderAccess()
    })
    await waitFor(() => expect(fake.clients).toHaveLength(2))
    queryClient.setQueryData(orderKeys.detail(scope, ids.order), makeOrder())
    act(() => oldCallback({ body: JSON.stringify(orderEvent()) } as Parameters<typeof oldCallback>[0]))
    expect(queryClient.getQueryState(orderKeys.detail(scope, ids.order))?.isInvalidated).toBe(false)
    act(() => useAuthStore.setState({ user: { ...cashierUser, id: 'different-user' } }))
    await waitFor(() => expect(fake.clients).toHaveLength(3))
    expect(fake.maxLive).toBe(1)
  })
  it('resume revalidates permissions once, refetches snapshot, and does not replay a QR toast', async () => {
    const access = vi.fn(() => HttpResponse.json({ ...cashierUser, permissions: [] }))
    server.use(
      http.get(base + '/auth/me', access),
      http.get(base + '/me/entitlements', () => HttpResponse.json(entitlement)),
    )
    await mountConnected(<Queue />)
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    act(() => {
      runtime.resume(false)
      runtime.resume(false)
      runtime.resume(false)
    })
    await waitFor(() => expect(access).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(fake.live).toBe(0))
    expect(screen.queryByText(/Có yêu cầu gọi món QR mới/)).not.toBeInTheDocument()
  })
})
describe('Event to REST snapshots and action safety', () => {
  it.each(['APPROVED', 'REJECTED', 'CANCELLED'] as const)(
    'QR CREATED refetches badge once; %s disappears after REST, without a new-request notification',
    async (status) => {
      let pending = false
      let calls = 0
      server.use(
        http.get(base + '/qr-order-requests', () => {
          calls++
          return HttpResponse.json(page(pending ? [reviewSummary()] : []))
        }),
      )
      await mountConnected(<Queue />)
      await waitFor(() => expect(calls).toBe(1))
      pending = true
      act(() => {
        fake.latest.emit('qr', qrEvent())
        fake.latest.emit('qr', qrEvent())
      })
      expect(screen.getByText(/Có yêu cầu gọi món QR mới/)).toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText('QR badge')).toHaveTextContent('1'))
      expect(calls).toBe(2)
      pending = false
      const event = qrEvent({
        eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        resourceVersion: 1,
        payload: { ...qrEvent().payload, status, changeKind: status },
      })
      act(() => fake.latest.emit('qr', event))
      await waitFor(() => expect(screen.getByLabelText('QR badge')).toHaveTextContent('0'))
      expect(calls).toBe(3)
    },
  )
  it.each(['CANCELLED', 'COMPLETED'] as const)(
    '%s exits active list from REST while filter/page remain unchanged',
    async (status) => {
      let terminal = false
      const criteria: URLSearchParams[] = []
      server.use(
        http.get(base + '/orders', ({ request }) => {
          criteria.push(new URL(request.url).searchParams)
          return HttpResponse.json(page(terminal ? [] : [makeOrder({ status: 'CONFIRMED' })], 2, 4))
        }),
      )
      await mountConnected(<List />)
      await screen.findByText(makeOrder().orderCode)
      terminal = true
      act(() =>
        fake.latest.emit(
          'orders',
          orderEvent({
            payload: { ...orderEvent().payload, orderStatus: status, changes: [status], newKitchenItemIds: [] },
          }),
        ),
      )
      await waitFor(() => expect(screen.queryByText(makeOrder().orderCode)).not.toBeInTheDocument())
      expect(criteria).toHaveLength(2)
      criteria.forEach((value) => {
        expect(value.get('page')).toBe('2')
        expect(value.get('q')).toBe('phở')
        expect(value.get('status')).toBe('CONFIRMED')
      })
    },
  )
  it('ITEMS_ADDED refreshes modal detail, table/session and exact active-order while status is unchanged', async () => {
    let version = 5
    server.use(
      http.get(base + '/orders/:id', () =>
        HttpResponse.json(makeOrder({ status: 'CONFIRMED', version, note: `snapshot-${version}` })),
      ),
    )
    const tableKey = orderKeys.tableList(scope, {})
    const activeKey = orderKeys.active(scope, ids.session)
    const unrelated = orderKeys.active(scope, ids.table)
    await mountConnected(<OrderDetailModal orderId={ids.order} onClose={() => {}} />)
    queryClient.setQueryData(tableKey, {})
    queryClient.setQueryData(activeKey, makeOrder())
    queryClient.setQueryData(unrelated, {})
    await screen.findByRole('dialog')
    await waitFor(() =>
      expect(queryClient.getQueryData<{ version: number }>(orderKeys.detail(scope, ids.order))?.version).toBe(5),
    )
    queryClient.setQueryData(unrelated, {}) // Initial CONNECT resync preceded this event.
    version = 6
    act(() => fake.latest.emit('orders', orderEvent({ resourceVersion: 6 })))
    await waitFor(() =>
      expect(queryClient.getQueryData<{ version: number }>(orderKeys.detail(scope, ids.order))?.version).toBe(6),
    )
    expect(queryClient.getQueryState(tableKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(activeKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(unrelated)?.isInvalidated).toBe(false)
    expect(screen.queryByText(/món mới/i)).not.toBeInTheDocument()
  })
  it('review context change blocks old hash and preserves rejection reason until explicit review', async () => {
    const user = userEvent.setup()
    let hash = 'a'.repeat(64)
    let decisions = 0
    server.use(
      http.get(base + '/qr-order-requests/:id', () => HttpResponse.json(reviewDetail({ reviewContextHash: hash }))),
      http.post(base + '/qr-order-requests/:id/approve', () => {
        decisions++
        return failure('QR_REVIEW_CONTEXT_CHANGED')
      }),
    )
    await mountConnected(<QrReviewModal requestId={reviewId} onClose={() => {}} onDone={() => {}} />)
    const approve = await screen.findByRole('button', { name: 'Xác nhận yêu cầu' })
    await waitFor(() => expect(approve).toBeEnabled())
    await user.click(screen.getByText('Từ chối yêu cầu'))
    await user.type(screen.getByLabelText('Lý do từ chối'), 'đang nhập lý do')
    hash = 'b'.repeat(64)
    act(() => fake.latest.emit('orders', orderEvent()))
    await waitFor(() => expect(approve).toBeDisabled())
    await waitFor(() =>
      expect(
        queryClient.getQueryData<{ reviewContextHash: string }>(qrReviewKeys.detail(scope, reviewId))
          ?.reviewContextHash,
      ).toBe(hash),
    )
    expect(screen.getByLabelText('Lý do từ chối')).toHaveValue('đang nhập lý do')
    await user.click(approve)
    expect(decisions).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Đọc lại yêu cầu' }))
    await waitFor(() => expect(approve).toBeEnabled())
    expect(screen.getByLabelText('Lý do từ chối')).toHaveValue('đang nhập lý do')
  })
  it('QR decision in flight retains form and REST decides completion exactly once', async () => {
    const user = userEvent.setup()
    const gate = deferred<void>()
    let calls = 0
    const onDone = vi.fn()
    server.use(
      http.post(base + '/qr-order-requests/:id/reject', async () => {
        calls++
        await gate.promise
        return HttpResponse.json(reviewSummary({ status: 'REJECTED', version: 3 }))
      }),
    )
    await mountConnected(<QrReviewModal requestId={reviewId} onClose={() => {}} onDone={onDone} />)
    await screen.findByText('Giá xác nhận hiện tại')
    await user.click(screen.getByText('Từ chối yêu cầu'))
    await user.type(screen.getByLabelText('Lý do từ chối'), 'hết món')
    await user.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }))
    await waitFor(() => expect(calls).toBe(1))
    act(() =>
      fake.latest.emit(
        'qr',
        qrEvent({ payload: { ...qrEvent().payload, status: 'REJECTED', changeKind: 'REJECTED' } }),
      ),
    )
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Lý do từ chối')).toHaveValue('hết món')
    gate.resolve()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(calls).toBe(1)
  })
  it('preserves append cart and blocks sending when remote order completes', async () => {
    const user = userEvent.setup()
    let completed = false
    let posts = 0
    const initial = makeOrder({ status: 'CONFIRMED' })
    server.use(
      http.get(base + '/orders/:id', () =>
        HttpResponse.json(completed ? { ...initial, status: 'COMPLETED', version: 6 } : initial),
      ),
      http.post(base + '/orders/:id/items', () => {
        posts++
        return HttpResponse.json(initial)
      }),
    )
    await mountConnected(<OrderAddItems order={initial} onClose={() => {}} />)
    await user.click(await screen.findByRole('button', { name: /Thêm Phở bò/ }))
    completed = true
    act(() =>
      fake.latest.emit(
        'orders',
        orderEvent({
          payload: { ...orderEvent().payload, orderStatus: 'COMPLETED', changes: ['COMPLETED'], newKitchenItemIds: [] },
        }),
      ),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gửi món thêm' })).toBeDisabled())
    expect(screen.getByRole('group', { name: 'Phở bò' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Kiểm tra lại đơn' }))
    await screen.findByText(/Đơn đã hoàn tất hoặc bị hủy/)
    expect(screen.getByRole('group', { name: 'Phở bò' })).toBeInTheDocument()
    expect(posts).toBe(0)
  })
  it('preserves cancel reason and stops a stale expectedVersion from being posted', async () => {
    const user = userEvent.setup()
    const initial = makeOrder()
    await mountConnected(<OrderEditor order={initial} kind="cancel" onClose={() => {}} />)
    await user.type(screen.getByLabelText('Lý do hủy'), 'khách đổi ý')
    act(() => fake.latest.emit('orders', orderEvent()))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeDisabled())
    expect(screen.getByLabelText('Lý do hủy')).toHaveValue('khách đổi ý')
  })
  it('keeps payment input and requires reviewing a new amount without confirming from socket', async () => {
    scope = seedOrderAccess(
      ['ORDER_VIEW', 'PAYMENT_CREATE', 'PAYMENT_CONFIRM'],
      ['ORDER_MANAGEMENT', 'PAYMENT_MANAGEMENT'],
    )
    const user = userEvent.setup()
    const initial = makeOrder({ status: 'CONFIRMED' })
    let changed = false
    let posts = 0
    server.use(
      http.get(base + '/orders/:id', () =>
        HttpResponse.json(changed ? { ...initial, version: 6, totalAmount: 150000, subtotalAmount: 150000 } : initial),
      ),
      http.post(base + '/orders/:id/payments', () => {
        posts++
        return failure('CONCURRENT_ORDER_UPDATE')
      }),
    )
    await mountConnected(<PaymentModal order={initial} onClose={() => {}} />)
    const input = screen.getByRole('textbox')
    await user.type(input, '200000')
    changed = true
    act(() => fake.latest.emit('orders', orderEvent()))
    await waitFor(() => expect(screen.getByRole('button', { name: /Xác nhận thu/ })).toBeDisabled())
    expect(input).toHaveValue('200000')
    expect(posts).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Kiểm tra lại đơn và số tiền' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Xác nhận thu/ })).toBeEnabled())
    expect(input).toHaveValue('200000')
    expect(posts).toBe(0)
  })
  it('kitchen consumer only refetches kitchen/items, including fan-out with same eventId', async () => {
    scope = seedOrderAccess(['KITCHEN_VIEW'], ['KITCHEN_DISPLAY'])
    let kitchenGets = 0
    let orderGets = 0
    server.use(
      http.get(base + '/kitchen/items', () => {
        kitchenGets++
        return HttpResponse.json(page([]))
      }),
      http.get(base + '/orders/:id', () => {
        orderGets++
        return failure('FORBIDDEN', 403)
      }),
    )
    function Kitchen() {
      const result = useQuery({
        queryKey: orderKeys.kitchen(scope, {}),
        queryFn: ({ signal }) => kitchenApi.items(scope, {}, signal),
      })
      return <span>{result.isSuccess ? 'kitchen loaded' : 'loading kitchen'}</span>
    }
    render(tree(<Kitchen />))
    await waitFor(() => expect(fake.clients).toHaveLength(1))
    act(() => fake.latest.connect())
    await screen.findByText('kitchen loaded')
    expect([...fake.latest.subscriptions.keys()]).toEqual([channels.kitchen])
    act(() => fake.latest.emit('kitchen', orderEvent()))
    await waitFor(() => expect(kitchenGets).toBe(2))
    expect(orderGets).toBe(0)
  })
  it('same eventId on ORDER and kitchen refreshes both consumers exactly once', async () => {
    scope = seedOrderAccess(['ORDER_VIEW', 'KITCHEN_VIEW'], ['ORDER_MANAGEMENT', 'KITCHEN_DISPLAY'])
    let orderGets = 0
    let kitchenGets = 0
    server.use(
      http.get(base + '/orders/:id', () => {
        orderGets++
        return HttpResponse.json(makeOrder())
      }),
      http.get(base + '/kitchen/items', () => {
        kitchenGets++
        return HttpResponse.json(page([]))
      }),
    )
    function Consumers() {
      const order = useOrderDetail(ids.order)
      const kitchen = useQuery({
        queryKey: orderKeys.kitchen(scope, {}),
        queryFn: ({ signal }) => kitchenApi.items(scope, {}, signal),
      })
      return <span>{order.isSuccess && kitchen.isSuccess ? 'both loaded' : 'loading'}</span>
    }
    await mountConnected(<Consumers />)
    await screen.findByText('both loaded')
    expect(orderGets).toBe(1)
    expect(kitchenGets).toBe(1)
    act(() => {
      fake.latest.emit('orders', orderEvent())
      fake.latest.emit('kitchen', orderEvent())
      fake.latest.emit('orders', orderEvent())
      fake.latest.emit('kitchen', orderEvent())
    })
    await waitFor(() => {
      expect(orderGets).toBe(2)
      expect(kitchenGets).toBe(2)
    })
    expect(fake.clients).toHaveLength(1)
  })
  it('late modal mutation response cannot replace a newer remote snapshot', async () => {
    const gate = deferred<void>()
    let posts = 0
    server.use(
      http.get(base + '/orders/:id', () => HttpResponse.json(makeOrder({ status: 'CONFIRMED' }))),
      http.post(base + '/orders/:id/mark-served', async () => {
        posts++
        await gate.promise
        return HttpResponse.json(makeOrder({ version: 6, status: 'SERVED' }))
      }),
    )
    await mountConnected(<OrderDetailModal orderId={ids.order} onClose={() => {}} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /Đã lên món/ }))
    await waitFor(() => expect(posts).toBe(1))
    act(() => queryClient.setQueryData(orderKeys.detail(scope, ids.order), makeOrder({ version: 8, status: 'SERVED' })))
    gate.resolve()
    await waitFor(() => expect(screen.queryByText('Đang xử lý...')).not.toBeInTheDocument())
    expect(queryClient.getQueryData<{ version: number }>(orderKeys.detail(scope, ids.order))?.version).toBe(8)
    expect(posts).toBe(1)
  })
  it.each(['modal', 'page'] as const)('stale response cannot overwrite newer cached order in %s', async (kind) => {
    const gate = deferred<void>()
    server.use(
      http.get(base + '/orders/:id', async () => {
        await gate.promise
        return HttpResponse.json(makeOrder({ version: 4 }))
      }),
    )
    if (kind === 'modal') render(tree(<OrderDetailModal orderId={ids.order} onClose={() => {}} />))
    else {
      function NavigateDetail() {
        const navigate = useNavigate()
        return (
          <>
            <button onClick={() => navigate('/cashier/orders/' + ids.order)}>open</button>
            <App realtimeRuntime={runtime} />
          </>
        )
      }
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/cashier/dashboard']}>
            <NavigateDetail />
          </MemoryRouter>
        </QueryClientProvider>,
      )
      await userEvent.setup().click(screen.getByText('open'))
    }
    await waitFor(() => expect(queryClient.isFetching({ queryKey: orderKeys.detail(scope, ids.order) })).toBe(1))
    act(() => queryClient.setQueryData(orderKeys.detail(scope, ids.order), makeOrder({ version: 8 })))
    gate.resolve()
    await waitFor(() => expect(queryClient.isFetching({ queryKey: orderKeys.detail(scope, ids.order) })).toBe(0))
    expect(queryClient.getQueryData<{ version: number }>(orderKeys.detail(scope, ids.order))?.version).toBe(8)
  })
})
