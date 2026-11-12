import { beforeEach, describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server, adminPaymentEvent, adminPurchase, adminUser } from './server'
import { useAuthStore } from '../features/auth/store/authStore'
import { setAccessToken } from '../shared/api/httpClient'
import { PaymentReviewPage } from '../features/admin/pages/PaymentReviewPage'
import { PurchaseListPage } from '../features/admin/pages/PurchaseListPage'
import { PurchaseDetailPage } from '../features/admin/pages/PurchaseDetailPage'
import { AdminDashboardPage } from '../features/admin/pages/AdminDashboardPage'
import { RestaurantSupportTab } from '../features/admin/components/RestaurantSupportTab'
import { RestaurantUserSupportActions } from '../features/admin/components/RestaurantUserSupportActions'

const API = 'http://localhost:8080/api/v1'
const reviewer = { ...adminUser, permissions: [...adminUser.permissions, 'SUBSCRIPTION_PAYMENT_REVIEW'] }

function renderAdmin(ui: ReactElement, initialEntry = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('admin payment review', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession()
    useAuthStore.setState({ status: 'authenticated', user: reviewer })
    setAccessToken('admin-token')
  })

  it('lists transfers waiting for review with a Vietnamese reason and hint', async () => {
    let requestUrl = ''
    server.use(http.get(`${API}/admin/payment-events`, ({ request }) => {
      requestUrl = request.url
      return HttpResponse.json({ content: [adminPaymentEvent], page: 0, size: 20, totalElements: 1, totalPages: 1 })
    }))
    renderAdmin(<PaymentReviewPage />, '/admin/payment-reviews')
    expect(await screen.findByText(/thanh toan goi PRO/)).toBeInTheDocument()
    expect(new URL(requestUrl).searchParams.get('state')).toBe('REVIEW_REQUIRED')
    expect(screen.getAllByText('Sai số tiền').length).toBeGreaterThan(0)
    expect(screen.getByText(/Kiểm tra chênh lệch/)).toBeInTheDocument()
  })

  it('accepts a transfer only after a long enough note and shows the amount difference', async () => {
    let body: unknown = null
    server.use(http.post(`${API}/admin/payment-events/event-1/accept`, async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ ...adminPaymentEvent, state: 'CLOSED', purchaseStatus: 'ACTIVATED' })
    }))
    const user = userEvent.setup()
    renderAdmin(<PaymentReviewPage />, '/admin/payment-reviews')
    await user.click(await screen.findByRole('button', { name: 'Xác nhận thanh toán' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Chênh lệch so với giá đơn/)).toBeInTheDocument()
    const submit = within(dialog).getByRole('button', { name: 'Xác nhận' })
    expect(submit).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'Khách chuyển thiếu 1.000đ')
    expect(submit).toBeEnabled()
    await user.click(submit)
    expect(await screen.findByText('Đã xác nhận thanh toán và kích hoạt gói.')).toBeInTheDocument()
    expect(body).toEqual({ note: 'Khách chuyển thiếu 1.000đ' })
  })

  it('requires choosing a purchase for an unlinked transfer', async () => {
    const unlinked = { ...adminPaymentEvent, id: 'event-2', reviewReason: 'REFERENCE_UNMATCHED' as const, purchaseId: null, purchaseStatus: null, purchaseAmount: null, restaurant: null }
    let body: unknown = null
    server.use(
      http.get(`${API}/admin/payment-events`, () => HttpResponse.json({ content: [unlinked], page: 0, size: 20, totalElements: 1, totalPages: 1 })),
      http.post(`${API}/admin/payment-events/event-2/accept`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...unlinked, state: 'CLOSED' })
      }),
    )
    const user = userEvent.setup()
    renderAdmin(<PaymentReviewPage />, '/admin/payment-reviews')
    await user.click(await screen.findByRole('button', { name: 'Xác nhận thanh toán' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByPlaceholderText(/Nhập mã\/tên nhà hàng/), 'DEMO')
    await user.type(within(dialog).getByPlaceholderText(/Khách chuyển thiếu/), 'Khách ghi sai nội dung chuyển khoản')
    const submit = within(dialog).getByRole('button', { name: 'Xác nhận' })
    expect(submit).toBeDisabled()
    await user.click(await within(dialog).findByRole('option'))
    expect(submit).toBeEnabled()
    await user.click(submit)
    await screen.findByText('Đã xác nhận thanh toán; gói sẽ được kích hoạt trong giây lát.')
    expect(body).toEqual({ note: 'Khách ghi sai nội dung chuyển khoản', purchaseId: 'purchase-1' })
  })

  it('closes a transfer with note and resolution reference and surfaces backend errors', async () => {
    server.use(http.post(`${API}/admin/payment-events/event-1/close`, () =>
      HttpResponse.json({ code: 'PAYMENT_EVENT_NOT_IN_REVIEW', message: 'Giao dịch đã được xử lý bởi người khác' }, { status: 409 }),
    ))
    const user = userEvent.setup()
    renderAdmin(<PaymentReviewPage />, '/admin/payment-reviews')
    await user.click(await screen.findByRole('button', { name: 'Đóng giao dịch' }))
    const dialog = screen.getByRole('dialog')
    const [note, reference] = within(dialog).getAllByRole('textbox')
    await user.type(note, 'Đã hoàn tiền cho khách')
    await user.type(reference, 'FT-HOAN-1')
    await user.click(within(dialog).getByRole('button', { name: 'Đóng giao dịch' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Giao dịch đã được xử lý bởi người khác')
  })

  it('hides the queue without the review permission', async () => {
    useAuthStore.setState({ status: 'authenticated', user: adminUser })
    renderAdmin(<PaymentReviewPage />, '/admin/payment-reviews')
    expect(await screen.findByText('Chưa có quyền đối soát')).toBeInTheDocument()
  })
})

describe('admin purchases', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession()
    useAuthStore.setState({ status: 'authenticated', user: reviewer })
    setAccessToken('admin-token')
  })

  it('filters purchases by status from the URL', async () => {
    let requestUrl = ''
    server.use(http.get(`${API}/admin/subscription-purchases`, ({ request }) => {
      requestUrl = request.url
      return HttpResponse.json({ content: [adminPurchase], page: 0, size: 20, totalElements: 1, totalPages: 1 })
    }))
    renderAdmin(<PurchaseListPage />, '/admin/purchases?status=REVIEW_REQUIRED')
    expect(await screen.findByText('DEMO01')).toBeInTheDocument()
    expect(new URL(requestUrl).searchParams.get('status')).toBe('REVIEW_REQUIRED')
  })

  it('offers close but not resume for an unpaid purchase in review', async () => {
    renderAdmin(<Routes><Route path="/admin/purchases/:purchaseId" element={<PurchaseDetailPage />} /></Routes>, '/admin/purchases/purchase-1')
    expect(await screen.findByRole('button', { name: 'Đóng đơn' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kích hoạt lại' })).not.toBeInTheDocument()
    expect(screen.getByText(/Đơn đang chờ xử lý: Sai số tiền/)).toBeInTheDocument()
  })

  it('resumes activation of a paid purchase', async () => {
    const paid = { ...adminPurchase, paidAt: '2026-11-10T03:05:00Z', reviewReason: 'SUBSCRIPTION_CONFLICT' as const }
    server.use(
      http.get(`${API}/admin/subscription-purchases/purchase-1`, () =>
        HttpResponse.json({ purchase: paid, createdByName: null, createdByEmail: null, cancelReason: null, activationRetryCount: 0, attempts: [], events: [] }),
      ),
      http.post(`${API}/admin/subscription-purchases/purchase-1/resume-activation`, () =>
        HttpResponse.json({ purchase: { ...paid, status: 'ACTIVATED' }, createdByName: null, createdByEmail: null, cancelReason: null, activationRetryCount: 0, attempts: [], events: [] }),
      ),
    )
    const user = userEvent.setup()
    renderAdmin(<Routes><Route path="/admin/purchases/:purchaseId" element={<PurchaseDetailPage />} /></Routes>, '/admin/purchases/purchase-1')
    await user.click(await screen.findByRole('button', { name: 'Kích hoạt lại' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Kích hoạt lại' }))
    expect(await screen.findByText('Đã kích hoạt gói.')).toBeInTheDocument()
  })
})

describe('admin revenue and restaurant support', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession()
    useAuthStore.setState({ status: 'authenticated', user: reviewer })
    setAccessToken('admin-token')
  })

  it('shows revenue KPIs, month-over-month change, review callout and a table view', async () => {
    const user = userEvent.setup()
    renderAdmin(<AdminDashboardPage />, '/admin/dashboard')
    expect(await screen.findByText('Doanh thu định kỳ / tháng (MRR)')).toBeInTheDocument()
    expect(screen.getByText('▲ 20% so với tháng trước')).toBeInTheDocument()
    expect(await screen.findByText(/1 giao dịch chuyển khoản và 1 đơn mua gói đang chờ xử lý/)).toBeInTheDocument()
    expect(screen.getByText('Chưa gia hạn')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Xem dạng bảng' }))
    expect(screen.getByRole('cell', { name: 'T11/26' })).toBeInTheDocument()
  })

  it('shows usage against the package and lets support add internal notes', async () => {
    const notes: Array<{ id: string; content: string; authorId: string; authorName: string; createdAt: string }> = []
    server.use(
      http.get(`${API}/admin/restaurants/restaurant-1/usage`, () =>
        HttpResponse.json({ packageCode: 'PRO', subscriptionEndAt: '2026-12-01T00:00:00Z', maxStaff: 5, activeStaff: 5, totalUsers: 7, activeTables: 12, activeMenuItems: 40, ordersLast30Days: 0, salesLast30Days: 0, lastOrderAt: null, lastLoginAt: null, features: ['POS_QUICK_ORDER'] }),
      ),
      http.get(`${API}/admin/restaurants/restaurant-1/notes`, () => HttpResponse.json(notes)),
      http.post(`${API}/admin/restaurants/restaurant-1/notes`, async ({ request }) => {
        const { content } = (await request.json()) as { content: string }
        const note = { id: `note-${notes.length + 1}`, content, authorId: 'admin-1', authorName: 'System Administrator', createdAt: '2026-11-15T03:00:00Z' }
        notes.unshift(note)
        return HttpResponse.json(note)
      }),
    )
    const user = userEvent.setup()
    renderAdmin(<RestaurantSupportTab restaurantId="restaurant-1" canManage />)
    expect(await screen.findByText('5 / 5')).toBeInTheDocument()
    expect(screen.getByText(/Đã dùng hết số nhân viên/)).toBeInTheDocument()
    expect(screen.getByText(/không có đơn trong 30 ngày/)).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText(/Đã gọi điện tư vấn/), 'Hẹn gọi lại thứ Hai')
    await user.click(screen.getByRole('button', { name: 'Thêm ghi chú' }))
    expect(await screen.findByText('Hẹn gọi lại thứ Hai')).toBeInTheDocument()
  })

  it('shows a temporary password once after a justified reset', async () => {
    server.use(http.post(`${API}/admin/restaurants/restaurant-1/users/user-9/temporary-password`, () =>
      HttpResponse.json({ temporaryPassword: 'Ab3kPq7RsT2m', revokedSessions: 2 }),
    ))
    const user = userEvent.setup()
    renderAdmin(
      <RestaurantUserSupportActions
        restaurantId="restaurant-1"
        user={{ id: 'user-9', name: 'Chủ quán', email: 'owner@example.com', phone: null, active: true, role: { id: 'r', code: 'OWNER', name: 'Owner', active: true }, lastLoginAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } as never}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Cấp mật khẩu tạm' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), 'Quên mật khẩu, đã xác minh')
    await user.click(within(dialog).getByRole('button', { name: 'Cấp mật khẩu' }))
    expect(await screen.findByText('Ab3kPq7RsT2m')).toBeInTheDocument()
  })
})
