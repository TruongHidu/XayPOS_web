import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { server } from './server'
import { queryClient } from '../shared/api/queryClient'
import { useAuthStore } from '../features/auth/store/authStore'
import { OrderRuntimeBoundary } from '../features/order/components/OrderRuntimeBoundary'
import { OrderGuard } from '../features/order/components/OrderGuard'
import { CashierPosPage } from '../features/order/pages/CashierPosPage'
import { OrderListPage } from '../features/order/pages/OrderListPage'
import { OrderDetailPage } from '../features/order/pages/OrderDetailPage'
import { useOrderDraftStore } from '../features/order/store/orderDraftStore'
import { orderKeys } from '../features/order/api/orderKeys'
import { orderScope } from '../features/order/policies/orderAccessPolicy'
import {
  seedOrderAccess,
  resetOrderTest,
  orderHandlers,
  orderFixture,
  itemFixture,
  tableFixture,
  sessionFixture,
  base,
  ids,
  allPermissions,
  allFeatures,
  cashierUser,
  entitlement,
  page,
  makeOrder,
} from './orderFixtures'
function mount(path = '/cashier/pos?serviceType=TAKEAWAY') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <OrderRuntimeBoundary>
          <Routes>
            <Route element={<OrderGuard permission="ORDER_CREATE" />}>
              <Route path="/cashier/pos" element={<CashierPosPage />} />
            </Route>
            <Route element={<OrderGuard permission="ORDER_VIEW" />}>
              <Route path="/cashier/orders" element={<OrderListPage />} />
              <Route path="/cashier/orders/:orderId" element={<OrderDetailPage />} />
            </Route>
            <Route path="/access-unavailable" element={<p>Feature unavailable</p>} />
            <Route path="/forbidden" element={<p>Forbidden page</p>} />
          </Routes>
        </OrderRuntimeBoundary>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
describe('Cashier Order UI and lifecycle', () => {
  beforeEach(() => {
    seedOrderAccess()
    server.use(...orderHandlers)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'alert').mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup()
    resetOrderTest()
    vi.restoreAllMocks()
  })
  it('TAKEAWAY submits directly; zero table/session requests or separate confirm', async () => {
    let tables = 0,
      posts = 0,
      confirms = 0
    server.use(
      http.get(base + '/tables*', () => {
        tables++
        return HttpResponse.json(page([tableFixture]))
      }),
      http.get(base + '/table-areas', () => {
        tables++
        return HttpResponse.json(page([]))
      }),
      http.get(base + '/table-sessions*', () => {
        tables++
        return HttpResponse.json(sessionFixture)
      }),
      http.post(base + '/orders', async ({ request }) => {
        posts++
        expect(await request.json()).toMatchObject({ submissionMode: 'SUBMIT', sourceChannel: 'CASHIER' })
        return HttpResponse.json(
          { ...orderFixture(), status: 'CONFIRMED', confirmedAt: '2026-10-13T01:00:00Z' },
          { status: 201 },
        )
      }),
      http.post(base + '/orders/:id/confirm', () => {
        confirms++
        return HttpResponse.json({
          ...orderFixture(),
          status: 'CONFIRMED',
          version: 6,
          confirmedAt: '2026-10-08T00:00:00Z',
        })
      }),
    )
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    await user.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await screen.findByRole('heading', { name: 'OD-TEST' })
    expect(posts).toBe(1)
    expect(confirms).toBe(0)
    expect(tables).toBe(0)
    expect(screen.queryByRole('button', { name: 'Thanh toán' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác nhận đơn' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm món' })).toBeInTheDocument()
  })
  it('create-only without table/view permission shows response, not GET detail', async () => {
    seedOrderAccess(
      ['ORDER_CREATE', 'ORDER_UPDATE', 'MENU_VIEW'],
      ['ORDER_MANAGEMENT', 'POS_QUICK_ORDER', 'MENU_MANAGEMENT'],
    )
    let detail = 0
    server.use(
      http.get(base + '/orders/:id', () => {
        detail++
        return HttpResponse.json(orderFixture())
      }),
    )
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    await user.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await screen.findByRole('heading', { name: 'OD-TEST' })
    expect(detail).toBe(0)
  })
  it('missing menu permission shows reason and never calls public/private menu', async () => {
    seedOrderAccess(['ORDER_CREATE', 'ORDER_UPDATE'])
    let calls = 0
    server.use(
      http.get(base + '/menu/*', () => {
        calls++
        return HttpResponse.json({})
      }),
      http.get(base + '/public/*', () => {
        calls++
        return HttpResponse.json({})
      }),
    )
    mount()
    await screen.findByText(/Cần MENU_VIEW/)
    expect(calls).toBe(0)
    expect(screen.getByRole('button', { name: 'Gửi đơn' })).toBeDisabled()
  })
  it('new order after create resets into a working cart, not an empty blocked context', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    await user.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await user.click(await screen.findByRole('button', { name: 'Tạo đơn khác' }))
    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    expect(useOrderDraftStore.getState().lines).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Gửi đơn' })).toBeEnabled()
  })
  it('create business403 freezes submit rather than refresh/retry loop', async () => {
    let posts = 0
    server.use(
      http.post(base + '/orders', () => {
        posts++
        return HttpResponse.json({ code: 'FORBIDDEN' }, { status: 403 })
      }),
    )
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    await user.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await screen.findByText(/Backend từ chối/)
    expect(screen.getByRole('button', { name: 'Gửi đơn' })).toBeDisabled()
    expect(posts).toBe(1)
  })
  it('groups and areas outside first page load through explicit pagination', async () => {
    server.use(
      http.get(base + '/table-areas', ({ request }) => {
        const index = Number(new URL(request.url).searchParams.get('page') ?? 0)
        return HttpResponse.json({
          content: [
            {
              id: index === 0 ? ids.area : ids.table,
              name: index === 0 ? 'Tầng 1' : 'Tầng 2',
              description: null,
              active: true,
              displayOrder: index,
              version: 1,
              createdAt: '2026-10-08T00:00:00Z',
              updatedAt: '2026-10-08T00:00:00Z',
            },
          ],
          page: index,
          size: 20,
          totalElements: 2,
          totalPages: 2,
        })
      }),
    )
    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=DINE_IN')
    await user.click(await screen.findByRole('button', { name: 'Thêm khu vực' }))
    await screen.findByRole('button', { name: 'Tầng 2' })
  })
  it('DINE_IN-only package can use POS without POS_QUICK_ORDER; occupied table never opens again', async () => {
    seedOrderAccess(allPermissions, ['ORDER_MANAGEMENT', 'TABLE_MANAGEMENT', 'MENU_MANAGEMENT'])
    let opens = 0
    server.use(
      http.post(base + '/tables/:id/sessions', () => {
        opens++
        return HttpResponse.json(sessionFixture, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    mount('/cashier/pos')
    await user.click(await screen.findByRole('button', { name: /Bàn 1 Đang sử dụng/ }))
    await screen.findByRole('button', { name: 'Thêm Phở bò' })
    expect(opens).toBe(0)
    expect(screen.getByText(/Phiên OPEN/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mang đi' })).toBeDisabled()
  })
  it('empty table stays local until SUBMIT; create uses tableId without opening a session request', async () => {
    let posts = 0,
      creates = 0
    server.use(
      http.get(base + '/tables', () =>
        HttpResponse.json(page([{ ...tableFixture, occupied: false, currentSession: null, canOpen: true }])),
      ),
      http.get(base + '/tables/:id', () =>
        HttpResponse.json(
          posts ? tableFixture : { ...tableFixture, occupied: false, currentSession: null, canOpen: true },
        ),
      ),
      http.post(base + '/tables/:id/sessions', async ({ request }) => {
        posts++
        await request.json()
        return HttpResponse.json(sessionFixture, { status: 201 })
      }),
      http.post(base + '/orders', async ({ request }) => {
        creates++
        const body = await request.json()
        expect(body).toMatchObject({ serviceType: 'DINE_IN', tableId: ids.table, submissionMode: 'SUBMIT' })
        expect(body).not.toHaveProperty('tableSessionId')
        return HttpResponse.json(
          { ...orderFixture(), serviceType: 'DINE_IN', tableSessionId: ids.session, status: 'CONFIRMED' },
          { status: 201 },
        )
      }),
    )
    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=DINE_IN')
    await user.click(await screen.findByRole('button', { name: /Bàn 1 Còn trống/ }))
    expect(posts).toBe(0)
    expect(creates).toBe(0)
    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    expect(posts).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await screen.findByRole('heading', { name: 'OD-TEST' })
    expect(posts).toBe(0)
    expect(creates).toBe(1)
  })
  it('missing TABLE_OPEN does not send POST opening', async () => {
    seedOrderAccess(allPermissions.filter((p) => p !== 'TABLE_OPEN'))
    let posts = 0
    server.use(
      http.get(base + '/tables', () =>
        HttpResponse.json(page([{ ...tableFixture, occupied: false, currentSession: null, canOpen: true }])),
      ),
      http.get(base + '/tables/:id', () =>
        HttpResponse.json({ ...tableFixture, occupied: false, currentSession: null, canOpen: true }),
      ),
      http.post(base + '/tables/:id/sessions', () => {
        posts++
        return HttpResponse.json(sessionFixture)
      }),
    )
    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=DINE_IN')
    await user.click(await screen.findByRole('button', { name: /Bàn 1 Còn trống/ }))
    await screen.findByText(/Cần nhân viên có TABLE_OPEN/)
    expect(posts).toBe(0)
  })
  it('deep link validates session OPEN; closed session cannot browse/add menu', async () => {
    let menus = 0
    server.use(
      http.get(base + '/table-sessions/:id', () => HttpResponse.json({ ...sessionFixture, status: 'CLOSED' })),
      http.get(base + '/menu/items', () => {
        menus++
        return HttpResponse.json(page([itemFixture]))
      }),
    )
    mount('/cashier/pos?tableSessionId=' + ids.session)
    await screen.findByText(/Phiên bàn không còn mở/)
    expect(menus).toBe(0)
  })
  it('filters occupancy on server, groups/areas paginate, no per-card current-session request', async () => {
    const filters: URL[] = []
    let current = 0
    server.use(
      http.get(base + '/tables', ({ request }) => {
        filters.push(new URL(request.url))
        return HttpResponse.json(page([tableFixture]))
      }),
      http.get(base + '/tables/:id/current-session', () => {
        current++
        return HttpResponse.json(sessionFixture)
      }),
    )
    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=DINE_IN')
    await screen.findByRole('button', { name: /Bàn 1 Đang sử dụng/ })
    expect(current).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Sử dụng' }))
    await waitFor(() => expect(filters.at(-1)?.searchParams.get('occupied')).toBe('true'))
    expect(filters.at(-1)?.searchParams.get('status')).toBe('AVAILABLE')
    expect(screen.getAllByRole('button', { name: /Mang đi/ })[0]).toBeEnabled()
  })
  it('one session has multiple orders; list filters URL and pagination on server', async () => {
    server.use(
      http.get(base + '/orders', () =>
        HttpResponse.json(page([orderFixture(), { ...orderFixture(), id: ids.item, orderCode: 'OD-SECOND' }])),
      ),
    )
    mount('/cashier/orders?tableSessionId=' + ids.session)
    await screen.findByText('OD-SECOND')
    expect(screen.getByText('OD-TEST')).toBeInTheDocument()
  })
  it('direct URL without ORDER permission/feature cannot fetch; fallback avoids redirect loops', async () => {
    seedOrderAccess(['MENU_VIEW'], allFeatures)
    let calls = 0
    server.use(
      http.get(base + '/orders*', () => {
        calls++
        return HttpResponse.json(orderFixture())
      }),
    )
    mount('/cashier/orders/' + ids.order)
    await screen.findByText('Forbidden page')
    expect(calls).toBe(0)
  })
  it('OPEN, confirmedAt permission boundary and CANCELLED keep snapshots/read-only', async () => {
    seedOrderAccess(['ORDER_VIEW', 'ORDER_UPDATE'])
    const confirmed = { ...orderFixture(), status: 'CONFIRMED', confirmedAt: '2026-10-08T00:00:00Z' }
    server.use(http.get(base + '/orders/:id', () => HttpResponse.json(confirmed)))
    mount('/cashier/orders/' + ids.order)
    await screen.findByText('Phở bò snapshot')
    expect(screen.queryByRole('button', { name: 'Hủy món' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sửa món' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thêm món' })).not.toBeInTheDocument()
  })
  it('conflict preserves entered form and root version; GET refresh does not overwrite draft', async () => {
    let version = 0
    server.use(
      http.patch(base + '/orders/:id', async ({ request }) => {
        version = ((await request.json()) as { expectedVersion: number }).expectedVersion
        return HttpResponse.json({ code: 'CONCURRENT_ORDER_UPDATE' }, { status: 409 })
      }),
    )
    const user = userEvent.setup()
    mount('/cashier/orders/' + ids.order)
    await user.click(await screen.findByRole('button', { name: 'Sửa thông tin' }))
    await user.type(screen.getByLabelText('Ghi chú đơn'), 'draft giữ lại')
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }))
    await screen.findByText(/Đơn đã được cập nhật/)
    expect(screen.getByLabelText('Ghi chú đơn')).toHaveValue('draft giữ lại')
    expect(version).toBe(5)
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeDisabled()
  })
  it('background cached version cannot advance an open form baseline', async () => {
    let posts = 0
    server.use(
      http.patch(base + '/orders/:id', () => {
        posts++
        return HttpResponse.json({ ...orderFixture(), version: 7 })
      }),
    )
    const user = userEvent.setup()
    mount('/cashier/orders/' + ids.order)
    await user.click(await screen.findByRole('button', { name: 'Sửa thông tin' }))
    await user.type(screen.getByLabelText('Ghi chú đơn'), 'draft')
    act(() =>
      queryClient.setQueryData(
        orderKeys.detail(orderScope(useAuthStore.getState()), ids.order),
        makeOrder({ version: 6 }),
      ),
    )
    expect(screen.getByLabelText('Ghi chú đơn')).toHaveValue('draft')
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }))
    await screen.findByText(/Đơn đã được cập nhật/)
    expect(posts).toBe(0)
  })
  it('cancel last pending line uses ORDER_UPDATE before confirm and receives root CANCELLED', async () => {
    seedOrderAccess(['ORDER_VIEW', 'ORDER_UPDATE'])
    const user = userEvent.setup()
    mount('/cashier/orders/' + ids.order)
    await user.click(await screen.findByRole('button', { name: 'Hủy món' }))
    await user.type(screen.getByLabelText('Lý do hủy'), 'Đổi món')
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getAllByText('Đã hủy').length).toBeGreaterThan(0)
  })
  it('entitlement transient unmount keeps cart; logout clears cart/context', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    expect(useOrderDraftStore.getState().lines).toHaveLength(1)
    act(() => useAuthStore.setState({ entitlementState: 'loading', user: { ...cashierUser } }))
    await screen.findByText('Đang kiểm tra quyền gọi món')
    act(() => useAuthStore.setState({ entitlementState: 'active', entitlement: { ...entitlement } }))
    await screen.findByRole('button', { name: 'Thêm Phở bò' })
    expect(useOrderDraftStore.getState().lines).toHaveLength(1)
    act(() => useAuthStore.getState().clearSession())
    await waitFor(() => expect(useOrderDraftStore.getState().lines).toHaveLength(0))
  })
  it('late create after logout never repopulates cart/result', async () => {
    server.use(
      http.post(base + '/orders', async () => {
        await delay(60)
        return HttpResponse.json(orderFixture(), { status: 201 })
      }),
    )
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    act(() => useAuthStore.getState().clearSession())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    expect(useOrderDraftStore.getState().result).toBeNull()
  })
  it('occupied table opens its active order instead of a new cart/root order', async () => {
    let creates = 0
    let opens = 0
    const serving = { ...orderFixture(), serviceType: 'DINE_IN', tableSessionId: ids.session, status: 'PREPARING' }
    server.use(
      http.get(base + '/table-sessions/:id/active-order', () => HttpResponse.json(serving)),
      http.get(base + '/orders/:id', () => HttpResponse.json(serving)),
      http.post(base + '/orders', () => {
        creates++
        return HttpResponse.json(serving)
      }),
      http.post(base + '/tables/:id/sessions', () => {
        opens++
        return HttpResponse.json(sessionFixture)
      }),
    )
    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=DINE_IN')
    await user.click(screen.getByRole('button', { name: 'Sử dụng' }))
    await user.click(await screen.findByRole('button', { name: /Bàn 1 Đang sử dụng/ }))
    await screen.findByRole('heading', { name: 'OD-TEST' })
    expect(screen.getByRole('button', { name: 'Thêm món' })).toBeInTheDocument()
    expect(creates).toBe(0)
    expect(opens).toBe(0)
    expect(useOrderDraftStore.getState().lines).toHaveLength(0)
  })
  it('unknown append survives modal close and GET; replay keeps key/body despite paid/newer order', async () => {
    const calls: { key: string | null; body: unknown }[] = []
    let latest = { ...orderFixture(), status: 'CONFIRMED', confirmedAt: '2026-10-13T01:00:00Z' }
    server.use(
      http.get(base + '/orders/:id', () => HttpResponse.json(latest)),
      http.post(base + '/orders/:id/items', async ({ request }) => {
        calls.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() })
        latest = { ...latest, version: 6, paymentStatus: 'PAID', paidAmount: 100000 }
        return calls.length === 1
          ? HttpResponse.error()
          : HttpResponse.json(latest, { headers: { 'Idempotency-Replayed': 'true' } })
      }),
    )
    const user = userEvent.setup()
    mount('/cashier/orders/' + ids.order)
    await user.click(await screen.findByRole('button', { name: 'Thêm món' }))
    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    await user.click(screen.getByRole('button', { name: 'Gửi món thêm' }))
    await screen.findByRole('button', { name: 'Kiểm tra bằng yêu cầu gọi thêm ban đầu' })
    expect(calls).toHaveLength(1)
    expect(calls[0].body).toMatchObject({ expectedVersion: 5, submissionMode: 'SUBMIT' })
    expect(calls[0].key).toBeTruthy()
    await user.click(screen.getAllByRole('button', { name: 'Đóng' }).at(-1)!)
    await user.click(screen.getByRole('button', { name: 'Tải lại đơn' }))
    await screen.findByText('Đã thanh toán')
    await user.click(screen.getByRole('button', { name: 'Kiểm tra yêu cầu gọi thêm' }))
    await user.click(screen.getByRole('button', { name: 'Kiểm tra bằng yêu cầu gọi thêm ban đầu' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
    expect(queryClient.getQueryData(orderKeys.detail(orderScope(useAuthStore.getState()), ids.order))).toMatchObject({
      version: 6,
      paymentStatus: 'PAID',
    })
    expect(screen.queryByRole('button', { name: 'Kiểm tra yêu cầu gọi thêm' })).not.toBeInTheDocument()
  })

  it('payment modal allows recording CASH payment with exact amount and change calculation', async () => {
    seedOrderAccess(
      [...allPermissions, 'PAYMENT_CREATE', 'PAYMENT_CONFIRM', 'PAYMENT_VIEW'],
      [...allFeatures, 'PAYMENT_MANAGEMENT'],
    )
    let paymentCall: { body: unknown; key: string | null } | null = null
    server.use(
      http.get(base + '/orders/:id', () =>
        HttpResponse.json({
          ...orderFixture(),
          status: 'CONFIRMED',
          confirmedAt: '2026-10-13T01:00:00Z',
        }),
      ),
      http.post(base + '/orders/:id/payments', async ({ request }) => {
        paymentCall = { body: await request.json(), key: request.headers.get('Idempotency-Key') }
        return HttpResponse.json({
          id: ids.item,
          orderId: ids.order,
          paymentCode: 'PAY-123',
          amount: 100000,
          currencyCode: 'VND',
          paymentMethod: 'CASH',
          confirmationSource: 'STAFF_MANUAL',
          provider: null,
          status: 'SUCCESS',
          referenceNo: null,
          requestedAt: '2026-10-13T01:00:00Z',
          paidAt: '2026-10-13T01:00:05Z',
          createdBy: ids.user,
        })
      }),
    )

    const user = userEvent.setup()
    mount('/cashier/orders/' + ids.order)
    const payBtn = await screen.findByRole('button', { name: /Thu tiền/ })
    await user.click(payBtn)

    expect(await screen.findByRole('heading', { name: /Thu tiền đơn hàng/ })).toBeInTheDocument()

    // Click quick chip 200.000 đ
    const chip200k = screen.getByRole('button', { name: '200.000 đ' })
    await user.click(chip200k)

    // Expect change to display
    expect(screen.getByText('Tiền thừa trả khách:')).toBeInTheDocument()

    // Confirm payment
    const confirmBtn = screen.getByRole('button', { name: /Xác nhận thu/ })
    await user.click(confirmBtn)

    await screen.findByText('Thanh toán thành công')
    expect(paymentCall).not.toBeNull()
    if (!paymentCall) throw new Error('paymentCall is null')
    expect((paymentCall as { body: unknown; key: string | null }).body).toMatchObject({
      expectedOrderVersion: 5,
      paymentMethod: 'CASH',
      amount: 100000,
    })
    expect((paymentCall as { body: unknown; key: string | null }).key).toBeTruthy()
    expect(screen.getByRole('button', { name: /Phiếu thu/ })).toBeInTheDocument()
  })

  it('OrderListPage renders 3-column kanban board with accurate column headers and filters', async () => {
    mount('/cashier/orders')

    expect(await screen.findByRole('region', { name: 'Chờ xử lý' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Đang chế biến' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Sẵn sàng / Đã giao' })).toBeInTheDocument()

    // Check filter toolbar elements
    expect(screen.getByPlaceholderText('OD-...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tìm' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /\+ Bán hàng \(POS\)/ })).toBeInTheDocument()
  })

  it('POS table selector only lists tables without session OR with session but no serving order yet', async () => {
    const tableEmpty = {
      ...tableFixture,
      id: 'a1111111-1111-4111-8111-111111111111',
      name: 'Bàn Trống',
      occupied: false,
      currentSession: null,
      canOpen: true,
    }
    const tableOpenNoOrder = {
      ...tableFixture,
      id: 'b2222222-2222-4222-8222-222222222222',
      name: 'Bàn Phiên Chưa Đơn',
      occupied: true,
      currentSession: {
        id: 'c3333333-3333-4333-8333-333333333333',
        sessionCode: 'TS-NO-ORD',
        guestCount: 2,
        openedAt: '2026-10-13T00:00:00Z',
        version: 1,
      },
      canOpen: false,
    }
    const tableOpenHasOrder = {
      ...tableFixture,
      id: 'd4444444-4444-4444-8444-444444444444',
      name: 'Bàn Đang Dùng Có Đơn',
      occupied: true,
      currentSession: {
        id: 'e5555555-5555-4555-8555-555555555555',
        sessionCode: 'TS-HAS-ORD',
        guestCount: 3,
        openedAt: '2026-10-13T00:00:00Z',
        version: 1,
      },
      canOpen: false,
    }

    server.use(
      http.get(base + '/tables', () => HttpResponse.json(page([tableEmpty, tableOpenNoOrder, tableOpenHasOrder]))),
      http.get(base + '/table-sessions/c3333333-3333-4333-8333-333333333333/active-order', () => new HttpResponse(null, { status: 204 })),
      http.get(base + '/table-sessions/e5555555-5555-4555-8555-555555555555/active-order', () => HttpResponse.json(orderFixture())),
    )

    mount('/cashier/pos?serviceType=DINE_IN')

    // 1. Bàn trống (không session) hiển thị
    expect(await screen.findByRole('button', { name: /Bàn Trống/ })).toBeInTheDocument()

    // 2. Bàn có session nhưng chưa có đơn hiển thị
    expect(screen.getByRole('button', { name: /Bàn Phiên Chưa Đơn/ })).toBeInTheDocument()

    // 3. Bàn có session VÀ đã có đơn không hiển thị trong phần tạo đơn mặc định
    expect(screen.queryByRole('button', { name: /Bàn Đang Dùng Có Đơn/ })).not.toBeInTheDocument()
  })

  it('1 lần gọi thì cộng dồn số lượng khi bấm cùng món nhiều lần trong POS', async () => {
    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=TAKEAWAY')

    const addBtn = await screen.findByRole('button', { name: 'Thêm Phở bò' })
    await user.click(addBtn)
    await user.click(addBtn)

    // Chỉ có 1 dòng trong giỏ nhưng số lượng là 2
    expect(useOrderDraftStore.getState().lines).toHaveLength(1)
    expect(useOrderDraftStore.getState().lines[0].quantity).toBe('2')
    expect(screen.getByText('2 tô')).toBeInTheDocument()
  })

  it('hiển thị mark Gọi thêm cho món được gọi thêm sau đó trong chi tiết đơn', async () => {
    const initialOrder = {
      ...orderFixture(),
      createdAt: '2026-10-13T10:00:00Z',
      confirmedAt: '2026-10-13T10:00:00Z',
      items: [
        {
          ...orderFixture().items[0],
          id: '55555555-5555-4555-8555-555555555551',
          itemName: 'Phở bò ban đầu',
          sentToKitchenAt: '2026-10-13T10:00:00Z',
        },
        {
          ...orderFixture().items[0],
          id: '55555555-5555-4555-8555-555555555552',
          itemName: 'Coca gọi thêm',
          sentToKitchenAt: '2026-10-13T10:15:00Z', // 15 phút sau
        },
      ],
    }

    server.use(
      http.get(base + '/orders/:id', () => HttpResponse.json(initialOrder)),
    )

    mount(`/cashier/orders/${initialOrder.id}`)

    expect(await screen.findByText('Phở bò ban đầu')).toBeInTheDocument()
    expect(screen.getByText('Coca gọi thêm')).toBeInTheDocument()

    // Món gọi thêm hiển thị mark Gọi thêm
    const appendMark = screen.getByText('➕ Gọi thêm')
    expect(appendMark).toBeInTheDocument()
  })
})

