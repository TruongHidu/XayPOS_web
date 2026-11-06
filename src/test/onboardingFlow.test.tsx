import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store/authStore'
import { OnboardingPage } from '../features/onboarding/pages/OnboardingPage'
import { PurchasePage } from '../features/onboarding/pages/PurchasePage'
import { packageSelection } from '../features/onboarding/utils/packageSelection'
import { queryClient } from '../shared/api/queryClient'
import { API, apiError, attemptFixture, catalog,onboardingOwner, onboardingStatus, purchaseFixture, restaurantProfile } from './onboardingFixtures'
import { server } from './server'

const purchaseId = purchaseFixture().id
const noAttempt = http.get(`${API}/subscription-purchases/:id/payment-attempts/current`, () =>
  HttpResponse.json({ paymentAttempt: null, serverTime: '2026-11-01T03:00:00Z' }),
)

function renderFlow(initialEntry = '/onboarding') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/onboarding/purchases/:purchaseId" element={<PurchasePage />} />
          <Route path="/cashier/dashboard" element={<div>POS DASHBOARD</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const baseHandlers = (status = onboardingStatus(), profile = restaurantProfile({ phone: '0900000000' })) => [
  http.get(`${API}/subscriptions/onboarding`, () => HttpResponse.json(status)),
  http.get(`${API}/restaurants/me`, () => HttpResponse.json(profile)),
  http.get(`${API}/packages`, () => HttpResponse.json(catalog)),
  noAttempt,
  http.get(`${API}/subscription-purchases`, ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json({ content: [], page: Number(url.searchParams.get('page')), size: 10, totalElements: 0, totalPages: 0 })
  }),
]

describe('onboarding flow', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useAuthStore.getState().clearSession()
    useAuthStore.setState({ status: 'authenticated', user: onboardingOwner, entitlementState: 'inactive' })
  })

  it('starts on the restaurant step when the profile is empty and lets the owner skip it', async () => {
    server.use(...baseHandlers(onboardingStatus(), restaurantProfile()))
    const user = userEvent.setup()
    renderFlow()
    expect(await screen.findByRole('heading', { name: 'Thông tin nhà hàng' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Bỏ qua' }))
    expect(await screen.findByRole('heading', { name: 'Chọn gói cho nhà hàng' })).toBeInTheDocument()
  })

  it('saves restaurant details and updates the session name', async () => {
    let body: unknown
    server.use(
      ...baseHandlers(onboardingStatus(), restaurantProfile()),
      http.patch(`${API}/restaurants/me`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(restaurantProfile({ name: 'Quán Mới', address: '12 Lê Lợi' }))
      }),
    )
    const user = userEvent.setup()
    renderFlow()
    const name = await screen.findByLabelText('Tên nhà hàng')
    await user.clear(name)
    await user.type(name, 'Quán Mới')
    await user.type(screen.getByLabelText('Địa chỉ'), '12 Lê Lợi')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    expect(await screen.findByRole('heading', { name: 'Chọn gói cho nhà hàng' })).toBeInTheDocument()
    expect(body).toEqual({ name: 'Quán Mới', phone: '', address: '12 Lê Lợi' })
    expect(useAuthStore.getState().user?.restaurantName).toBe('Quán Mới')
  })

  it('preselects the landing package and creates the purchase with only packageCode', async () => {
    packageSelection.write('PRO')
    let body: unknown
    let key: string | null = null
    server.use(
      ...baseHandlers(),
      http.post(`${API}/subscription-purchases`, async ({ request }) => {
        body = await request.json()
        key = request.headers.get('Idempotency-Key')
        return HttpResponse.json(purchaseFixture(), { status: 201 })
      }),
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(purchaseFixture())),
    )
    const user = userEvent.setup()
    renderFlow()
    await user.click(await screen.findByRole('button', { name: 'Xác nhận gói Pro' }))
    expect(await screen.findByRole('heading', { name: 'Thanh toán online chưa mở' })).toBeInTheDocument()
    expect(body).toEqual({ packageCode: 'PRO' })
    expect(key).toMatch(/^purchase-/)
    expect(packageSelection.read()).toBeNull()
  })

  it('goes straight from package confirmation to the QR', async () => {
    packageSelection.write('PRO')
    const payable = purchaseFixture({ allowedActions: ['VIEW_PURCHASE', 'CREATE_PAYMENT_ATTEMPT', 'CANCEL_PURCHASE'] })
    let attemptKey: string | null = null
    server.use(...baseHandlers())
    server.use(
      http.post(`${API}/subscription-purchases`, () => HttpResponse.json(payable, { status: 201 })),
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(payable)),
      http.get(`${API}/subscription-purchases/:id/payment-attempts/current`, () =>
        HttpResponse.json({ paymentAttempt: attemptKey ? attemptFixture() : null, serverTime: '2026-11-01T03:01:00Z' }),
      ),
      http.post(`${API}/subscription-purchases/:id/payment-attempts`, ({ request }) => {
        attemptKey = request.headers.get('Idempotency-Key')
        return HttpResponse.json(attemptFixture(), { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderFlow()
    await user.click(await screen.findByRole('button', { name: 'Xác nhận gói Pro' }))
    expect(await screen.findByRole('heading', { name: 'Quét mã để thanh toán' })).toBeInTheDocument()
    expect(attemptKey).toMatch(/^attempt-/)
  })

  it('reuses the idempotency key when retrying after a network failure', async () => {
    packageSelection.write('PRO')
    const keys: (string | null)[] = []
    server.use(
      ...baseHandlers(),
      http.post(`${API}/subscription-purchases`, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        return keys.length === 1 ? HttpResponse.error() : HttpResponse.json(purchaseFixture(), { status: 201 })
      }),
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(purchaseFixture())),
    )
    const user = userEvent.setup()
    renderFlow()
    await user.click(await screen.findByRole('button', { name: 'Xác nhận gói Pro' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('không tạo trùng')
    await user.click(screen.getByRole('button', { name: 'Xác nhận gói Pro' }))
    expect(await screen.findByRole('heading', { name: 'Thanh toán online chưa mở' })).toBeInTheDocument()
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('shows the current state from GET detail after a replayed POST', async () => {
    packageSelection.write('PRO')
    server.use(
      ...baseHandlers(),
      http.post(`${API}/subscription-purchases`, () => HttpResponse.json(purchaseFixture(), { headers: { 'Idempotency-Replayed': 'true' } })),
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(purchaseFixture({ status: 'ACTIVATED', displayStatus: 'ACTIVATED', allowedActions: ['OPEN_APP'] }))),
    )
    const user = userEvent.setup()
    renderFlow()
    await user.click(await screen.findByRole('button', { name: 'Xác nhận gói Pro' }))
    expect(await screen.findByRole('heading', { name: 'Gói đã được kích hoạt' })).toBeInTheDocument()
  })

  it('moves to the existing purchase after a 409 PURCHASE_IN_PROGRESS', async () => {
    packageSelection.write('PRO')
    let conflict = false
    server.use(
      http.get(`${API}/subscriptions/onboarding`, () =>
        HttpResponse.json(conflict ? onboardingStatus({ canPurchase: false, blockedReason: 'PURCHASE_IN_PROGRESS', currentPurchase: purchaseFixture() }) : onboardingStatus()),
      ),
      ...baseHandlers().slice(1),
      http.post(`${API}/subscription-purchases`, () => {
        conflict = true
        return apiError(409, 'PURCHASE_IN_PROGRESS')
      }),
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(purchaseFixture())),
    )
    const user = userEvent.setup()
    renderFlow()
    await user.click(await screen.findByRole('button', { name: 'Xác nhận gói Pro' }))
    expect(await screen.findByRole('heading', { name: 'Thanh toán online chưa mở' })).toBeInTheDocument()
  })

  it('shows packages without purchase buttons while new purchases are off', async () => {
    server.use(...baseHandlers(onboardingStatus({ canPurchase: false, blockedReason: 'PURCHASE_UNAVAILABLE', allowedActions: [] })))
    renderFlow()
    expect(await screen.findByText(/tạm ngưng nhận đơn/)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Pro' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Xác nhận gói|Chọn gói/ })).not.toBeInTheDocument()
  })

  it('offers a session refresh when an old token lacks purchase permissions', async () => {
    server.use(http.get(`${API}/subscriptions/onboarding`, () => apiError(403, 'FORBIDDEN')), ...baseHandlers().slice(1))
    renderFlow()
    expect(await screen.findByRole('button', { name: 'Làm mới phiên' })).toBeInTheDocument()
  })

  it('reloads entitlement before opening POS for an active restaurant', async () => {
    server.use(...baseHandlers(onboardingStatus({ subscriptionState: 'ACTIVE', canPurchase: false, blockedReason: 'SUBSCRIPTION_ALREADY_ACTIVE', allowedActions: ['OPEN_APP'] })))
    const user = userEvent.setup()
    renderFlow()
    await user.click(await screen.findByRole('button', { name: 'Vào POS' }))
    expect(await screen.findByText('POS DASHBOARD')).toBeInTheDocument()
    expect(useAuthStore.getState().entitlementState).toBe('active')
  })
})

describe('purchase page', () => {
  const entry = `/onboarding/purchases/${purchaseId}`

  beforeEach(() => {
    sessionStorage.clear()
    useAuthStore.getState().clearSession()
    useAuthStore.setState({ status: 'authenticated', user: onboardingOwner, entitlementState: 'inactive' })
    server.use(noAttempt)
  })

  it('shows the quote and a countdown from server time, with no QR or success claim', async () => {
    server.use(http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(purchaseFixture())))
    renderFlow(entry)
    expect(await screen.findByText('15:00')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Gói Pro' })).toBeInTheDocument()
    expect(screen.getByText('Tối đa 30 nhân viên')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('cancels with the version from the latest GET', async () => {
    let body: unknown
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(purchaseFixture({ version: 3 }))),
      http.post(`${API}/subscription-purchases/:id/cancel`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(purchaseFixture({ status: 'CANCELLED', displayStatus: 'CANCELLED', cancelledAt: '2026-11-01T03:05:00Z', allowedActions: ['VIEW_PURCHASE'], version: 4 }))
      }),
    )
    const user = userEvent.setup()
    renderFlow(entry)
    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }))
    await user.click(screen.getByRole('button', { name: 'Xác nhận hủy' }))
    expect(await screen.findByRole('heading', { name: 'Đơn đã được hủy' })).toBeInTheDocument()
    expect(body).toEqual({ expectedVersion: 3 })
    expect(screen.getByRole('link', { name: 'Chọn gói lại' })).toBeInTheDocument()
  })

  it('reloads the purchase on a stale version instead of resending', async () => {
    let reads = 0
    let cancels = 0
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => {
        reads += 1
        return HttpResponse.json(purchaseFixture({ version: reads }))
      }),
      http.post(`${API}/subscription-purchases/:id/cancel`, () => {
        cancels += 1
        return apiError(409, 'CONCURRENT_SUBSCRIPTION_UPDATE')
      }),
    )
    const user = userEvent.setup()
    renderFlow(entry)
    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }))
    await user.click(screen.getByRole('button', { name: 'Xác nhận hủy' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Đơn vừa có thay đổi')
    await waitFor(() => expect(reads).toBe(2))
    expect(cancels).toBe(1)
  })

  it('hides cancel once the server projects the purchase as expired', async () => {
    server.use(http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(purchaseFixture({ displayStatus: 'EXPIRED' }))))
    renderFlow(entry)
    expect(await screen.findByRole('heading', { name: 'Đơn đã hết hạn' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument()
  })

  it('does not offer cancel without the allowed action', async () => {
    server.use(http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(purchaseFixture({ allowedActions: ['VIEW_PURCHASE'] }))))
    renderFlow(entry)
    expect(await screen.findByRole('heading', { name: 'Thanh toán online chưa mở' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument()
  })

  it.each([
    ['PAID', 'Đã nhận tiền, đang kích hoạt'],
    ['REVIEW_REQUIRED', 'Đơn đang được kiểm tra'],
    ['CLOSED', 'Đơn đã được đóng'],
  ] as const)('shows the %s state without cancel', async (displayStatus, title) => {
    server.use(http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(purchaseFixture({ status: displayStatus, displayStatus }))))
    renderFlow(entry)
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument()
  })

  it('reports a purchase from another tenant as not found', async () => {
    server.use(http.get(`${API}/subscription-purchases/:id`, () => apiError(404, 'PURCHASE_NOT_FOUND')))
    renderFlow(entry)
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy đơn mua gói' })).toBeInTheDocument()
  })
})
