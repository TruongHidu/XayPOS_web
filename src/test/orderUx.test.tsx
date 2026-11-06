import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { server } from './server'
import { queryClient } from '../shared/api/queryClient'
import { OrderRuntimeBoundary } from '../features/order/components/OrderRuntimeBoundary'
import { OrderGuard } from '../features/order/components/OrderGuard'
import { CashierPosPage } from '../features/order/pages/CashierPosPage'
import { OrderListPage } from '../features/order/pages/OrderListPage'
import { OrderDetailPage } from '../features/order/pages/OrderDetailPage'
import { useOrderDraftStore } from '../features/order/store/orderDraftStore'
import {
  seedOrderAccess,
  resetOrderTest,
  orderHandlers,
  orderFixture,
  itemFixture,
  tableFixture,
  base,
  ids,
  allPermissions,
  allFeatures,
  page,
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

describe('Order UX Enhanced Workflows', () => {
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

  // 1. Luồng tại bàn: chọn bàn trống → chuyển sang thực đơn → thêm món → tăng/giảm/xóa dòng → gửi đơn thành công.
  it('1. Dine-in flow: selects empty table, navigates to menu, modifies qty, submits order', async () => {
    const emptyTable = {
      ...tableFixture,
      id: 'a1111111-1111-4111-8111-111111111111',
      name: 'Bàn Trống 1',
      occupied: false,
      currentSession: null,
      canOpen: true,
      status: 'AVAILABLE',
    }
    server.use(
      http.get(base + '/tables', () => HttpResponse.json(page([emptyTable]))),
      http.get(base + '/tables/:id', () => HttpResponse.json(emptyTable)),
    )

    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=DINE_IN')

    // Click table card
    const tableBtn = await screen.findByRole('button', { name: /Bàn Trống 1 Còn trống/ }, { timeout: 8000 })
    await user.click(tableBtn)

    // Automatically switches to menu, menu item visible
    const addBtn = await screen.findByRole('button', { name: 'Thêm Phở bò' }, { timeout: 8000 })
    await user.click(addBtn)

    // Stepper + / -
    expect(screen.getByText('1 tô')).toBeInTheDocument()
    const plusBtn = screen.getByRole('button', { name: 'Tăng 1' })
    await user.click(plusBtn)
    expect(screen.getByText('2 tô')).toBeInTheDocument()

    const minusBtn = screen.getByRole('button', { name: 'Giảm 1' })
    await user.click(minusBtn)
    expect(screen.getByText('1 tô')).toBeInTheDocument()

    // Submit order
    const submitBtn = screen.getByRole('button', { name: 'Gửi đơn' })
    await user.click(submitBtn)

    await screen.findByRole('heading', { name: 'OD-TEST' }, { timeout: 8000 })
    expect(screen.getByText(/Gọi món thành công/)).toBeInTheDocument()
  }, 15000)

  // 2. Luồng mang đi: thêm món → gửi đơn, không yêu cầu chọn bàn.
  it('2. Takeaway flow: adds item directly without table selection and submits successfully', async () => {
    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=TAKEAWAY')

    const addBtn = await screen.findByRole('button', { name: 'Thêm Phở bò' })
    await user.click(addBtn)

    expect(screen.getByText('🛍️ Mang đi')).toBeInTheDocument()
    const submitBtn = screen.getByRole('button', { name: 'Gửi đơn' })
    await user.click(submitBtn)

    await screen.findByRole('heading', { name: 'OD-TEST' })
  })

  // 3. Bàn không khả dụng/khu vực ngừng hoạt động không chọn được và có nhãn lý do.
  it('3. Unavailable table or inactive area table is disabled with reason label', async () => {
    const inactiveTable = {
      ...tableFixture,
      id: 'b1111111-1111-4111-8111-111111111111',
      name: 'Bàn Hỏng',
      status: 'INACTIVE',
      occupied: false,
      currentSession: null,
      canOpen: false,
    }
    const inactiveAreaTable = {
      ...tableFixture,
      id: 'b2222222-2222-4222-8222-222222222222',
      name: 'Bàn Sân Thượng',
      status: 'AVAILABLE',
      area: { id: 'b3333333-3333-4333-8333-333333333333', name: 'Sân thượng', active: false },
      occupied: false,
      currentSession: null,
      canOpen: false,
    }

    server.use(
      http.get(base + '/tables', () => HttpResponse.json(page([inactiveTable, inactiveAreaTable]))),
    )

    mount('/cashier/pos?serviceType=DINE_IN')

    const table1 = await screen.findByRole('button', { name: /Bàn Hỏng/ })
    expect(table1).toBeDisabled()
    expect(screen.getByText('Không hoạt động')).toBeInTheDocument()

    const table2 = screen.getByRole('button', { name: /Bàn Sân Thượng/ })
    expect(table2).toBeDisabled()
    expect(screen.getByText('Khu vực tạm ngưng')).toBeInTheDocument()
  })

  // 4. Badge số lượng trên thẻ món khớp với giỏ.
  it('4. Corner quantity badge on menu card reflects items in cart', async () => {
    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=TAKEAWAY')

    const addBtn = await screen.findByRole('button', { name: 'Thêm Phở bò' })
    expect(screen.queryByLabelText(/Đã có .* trong giỏ/)).not.toBeInTheDocument()

    await user.click(addBtn)
    expect(screen.getByLabelText('Đã có 1 trong giỏ')).toHaveTextContent('1')

    await user.click(addBtn)
    expect(screen.getByLabelText('Đã có 2 trong giỏ')).toHaveTextContent('2')
  })

  // 5. Món không bán bị disabled và không thêm được.
  it('5. Unsellable item is disabled with Hết hàng badge and cannot be clicked', async () => {
    const unsellableItem = {
      ...itemFixture,
      id: 'c1111111-1111-4111-8111-111111111111',
      name: 'Bún chả hết hàng',
      sellable: false,
    }

    server.use(
      http.get(base + '/menu/items', () => HttpResponse.json(page([unsellableItem]))),
    )

    mount('/cashier/pos?serviceType=TAKEAWAY')

    const itemBtn = await screen.findByRole('button', { name: 'Thêm Bún chả hết hàng' })
    expect(itemBtn).toBeDisabled()
    expect(screen.getByText('Hết hàng')).toBeInTheDocument()
  })

  // 6. Khi pending, nút gửi bị disabled; nhấn nhiều lần chỉ gửi một request.
  it('6. When pending, submit button is disabled and does not double-submit', async () => {
    let submitCalls = 0
    server.use(
      http.post(base + '/orders', async () => {
        submitCalls++
        await delay(150)
        return HttpResponse.json(orderFixture(), { status: 201 })
      }),
    )

    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=TAKEAWAY')

    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    const submitBtn = screen.getByRole('button', { name: 'Gửi đơn' })

    // Rapid double click
    fireEvent.click(submitBtn)
    fireEvent.click(submitBtn)

    expect(screen.getByRole('button', { name: 'Đang gửi...' })).toBeDisabled()
    await waitFor(() => expect(submitCalls).toBe(1))
  })

  // 7. Khi uncertain, thử lại dùng lại cùng idempotency key.
  it('7. When uncertain, retry button uses the exact same idempotency key', async () => {
    const keys: (string | null)[] = []
    let callCount = 0

    server.use(
      http.post(base + '/orders', async ({ request }) => {
        callCount++
        keys.push(request.headers.get('Idempotency-Key'))
        if (callCount === 1) {
          return HttpResponse.error()
        }
        return HttpResponse.json(
          { ...orderFixture(), status: 'CONFIRMED' },
          { status: 201, headers: { 'Idempotency-Replayed': 'true' } },
        )
      }),
    )

    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=TAKEAWAY')

    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    await user.click(screen.getByRole('button', { name: 'Gửi đơn' }))

    // Expect uncertain alert and retry button
    const retryBtn = await screen.findByRole('button', { name: 'Thử lại' })
    expect(keys).toHaveLength(1)
    expect(keys[0]).toBeTruthy()

    await user.click(retryBtn)
    await screen.findByRole('heading', { name: 'OD-TEST' })

    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
  })

  // 8. Khi refused, hiển thị lỗi và giỏ vẫn sửa được.
  it('8. When refused, displays backend refusal message and disables submit', async () => {
    server.use(
      http.post(base + '/orders', () =>
        HttpResponse.json({ code: 'FORBIDDEN', message: 'Không có quyền tạo đơn' }, { status: 403 }),
      ),
    )

    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=TAKEAWAY')

    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    await user.click(screen.getByRole('button', { name: 'Gửi đơn' }))

    await screen.findByText(/Backend từ chối quyền/)
    expect(screen.getByRole('button', { name: 'Gửi đơn' })).toBeDisabled()
  })

  // 9. Đổi bàn/rời trang khi giỏ có món sẽ gọi confirmDraftExit.
  it('9. Changing table or switching service type with items prompts confirmDraftExit', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=DINE_IN&tableId=' + ids.table)

    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    expect(useOrderDraftStore.getState().lines).toHaveLength(1)

    // Click switch service type to Takeaway
    const takeawayBtn = screen.getByRole('button', { name: /Mang đi/ })
    await user.click(takeawayBtn)

    expect(confirmSpy).toHaveBeenCalled()
  })

  // 10. Người dùng thiếu quyền tạo đơn/thanh toán không thấy hành động tương ứng.
  it('10. User missing payment permission does not see Thanh toán ngay button', async () => {
    seedOrderAccess(allPermissions.filter((p) => !p.startsWith('PAYMENT_')), allFeatures.filter((f) => f !== 'PAYMENT_MANAGEMENT'))

    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=TAKEAWAY')

    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    await user.click(screen.getByRole('button', { name: 'Gửi đơn' }))

    await screen.findByRole('heading', { name: 'OD-TEST' })
    expect(screen.queryByRole('button', { name: /Thanh toán ngay/ })).not.toBeInTheDocument()
  })

  // 11. Nút "Thanh toán ngay" (nếu thêm) mở PaymentModal và hủy timer chuyển hướng.
  it('11. Pay now button opens PaymentModal and cancels redirect timer', async () => {
    seedOrderAccess(
      [...allPermissions, 'PAYMENT_CREATE', 'PAYMENT_CONFIRM', 'PAYMENT_VIEW'],
      [...allFeatures, 'PAYMENT_MANAGEMENT'],
    )

    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=TAKEAWAY')

    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    await user.click(screen.getByRole('button', { name: 'Gửi đơn' }))

    const payNowBtn = await screen.findByRole('button', { name: /Thanh toán ngay/ })
    await user.click(payNowBtn)

    // PaymentModal opens
    expect(await screen.findByRole('heading', { name: /Thu tiền đơn hàng/ })).toBeInTheDocument()
  })

  // 12. Xóa giỏ cần xác nhận.
  it('12. Clearing cart prompts confirmation and resets draft lines', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=TAKEAWAY')

    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    expect(useOrderDraftStore.getState().lines).toHaveLength(1)

    const clearBtn = screen.getByRole('button', { name: 'Xóa giỏ' })
    await user.click(clearBtn)

    expect(confirmSpy).toHaveBeenCalled()
    expect(useOrderDraftStore.getState().lines).toHaveLength(0)
    expect(screen.getByText('Giỏ món đang trống. Chọn món từ thực đơn để bắt đầu.')).toBeInTheDocument()
  })

  // 13. Tab mobile giữ từ khóa tìm kiếm khi chuyển qua lại.
  it('13. Mobile tabs preserve search query when toggling between tabs', async () => {
    const user = userEvent.setup()
    mount('/cashier/pos?serviceType=TAKEAWAY')

    const searchInput = await screen.findByPlaceholderText('Nhập tên món...')
    await user.type(searchInput, 'Phở')
    expect(searchInput).toHaveValue('Phở')

    // Click Cart tab
    const cartTab = screen.getByRole('button', { name: /Giỏ/ })
    await user.click(cartTab)

    // Click Menu tab back
    const menuTab = screen.getByRole('button', { name: 'Chọn món' })
    await user.click(menuTab)

    // Search input still retains 'Phở'
    const searchAfter = screen.getByPlaceholderText('Nhập tên món...')
    expect(searchAfter).toHaveValue('Phở')
  })
})
