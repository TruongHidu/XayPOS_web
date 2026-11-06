import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store/authStore'
import { PurchasePage } from '../features/onboarding/pages/PurchasePage'
import type { PaymentAttempt, PurchaseView } from '../features/onboarding/schemas'
import { purchasePollDelay } from '../features/onboarding/utils/purchasePolling'
import { queryClient } from '../shared/api/queryClient'
import { API, apiError, attemptFixture, onboardingOwner, purchaseFixture } from './onboardingFixtures'
import { server } from './server'

const payable = (overrides: Partial<PurchaseView> = {}) =>
  purchaseFixture({ allowedActions: ['VIEW_PURCHASE', 'CREATE_PAYMENT_ATTEMPT', 'CANCEL_PURCHASE'], ...overrides })
const purchaseId = payable().id
const currentUrl = `${API}/subscription-purchases/:id/payment-attempts/current`
const createUrl = `${API}/subscription-purchases/:id/payment-attempts`
const current = (paymentAttempt: PaymentAttempt | null) => HttpResponse.json({ paymentAttempt, serverTime: '2026-11-01T03:01:00Z' })

function renderPurchase(state: unknown = null) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: `/onboarding/purchases/${purchaseId}`, state }]}>
        <Routes>
          <Route path="/onboarding/purchases/:purchaseId" element={<PurchasePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('payment attempt', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useAuthStore.getState().clearSession()
    useAuthStore.setState({ status: 'authenticated', user: onboardingOwner, entitlementState: 'inactive' })
  })

  it('waits for the owner instead of creating a QR on page load', async () => {
    let posts = 0
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(payable())),
      http.get(currentUrl, () => current(null)),
      http.post(createUrl, () => {
        posts += 1
        return HttpResponse.json(attemptFixture(), { status: 201 })
      }),
    )
    renderPurchase()
    expect(await screen.findByRole('button', { name: 'Tạo mã QR thanh toán' })).toBeInTheDocument()
    expect(posts).toBe(0)
  })

  it('creates the attempt with an empty body and a key, then shows the QR from GET current', async () => {
    let created = false
    let body: unknown
    let key: string | null = null
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(payable())),
      http.get(currentUrl, () => current(created ? attemptFixture() : null)),
      http.post(createUrl, async ({ request }) => {
        body = await request.json()
        key = request.headers.get('Idempotency-Key')
        created = true
        // Replay-style stale body: the screen must not render from it.
        return HttpResponse.json(attemptFixture({ referenceCode: 'PSSTALE', instructions: { ...attemptFixture().instructions, transferContent: 'PSSTALE' } }), { status: 200 })
      }),
    )
    const user = userEvent.setup()
    renderPurchase()
    await user.click(await screen.findByRole('button', { name: 'Tạo mã QR thanh toán' }))
    expect(await screen.findByRole('heading', { name: 'Quét mã để thanh toán' })).toBeInTheDocument()
    expect(body).toEqual({})
    expect(key).toMatch(/^attempt-[A-Za-z0-9._:-]+$/)
    expect(screen.getByRole('img', { name: 'Mã VietQR thanh toán' })).toBeInTheDocument()
    expect(screen.getByText('PS0123456789ABCDEF0123')).toBeInTheDocument()
    expect(screen.queryByText('PSSTALE')).not.toBeInTheDocument()
    expect(screen.getByText('0123456789')).toBeInTheDocument()
    expect(screen.getByText('Mã QR hết hạn sau')).toBeInTheDocument()
  })

  it('keeps the key when retrying after a network failure', async () => {
    const keys: (string | null)[] = []
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(payable())),
      http.get(currentUrl, () => current(keys.length > 1 ? attemptFixture() : null)),
      http.post(createUrl, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        return keys.length === 1 ? HttpResponse.error() : HttpResponse.json(attemptFixture(), { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderPurchase()
    await user.click(await screen.findByRole('button', { name: 'Tạo mã QR thanh toán' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('không tạo trùng')
    await user.click(screen.getByRole('button', { name: 'Tạo mã QR thanh toán' }))
    expect(await screen.findByRole('heading', { name: 'Quét mã để thanh toán' })).toBeInTheDocument()
    expect(keys[0]).toBe(keys[1])
  })

  it('opens the QR another tab already created on PAYMENT_ATTEMPT_PENDING', async () => {
    let conflict = false
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(payable())),
      http.get(currentUrl, () => current(conflict ? attemptFixture() : null)),
      http.post(createUrl, () => {
        conflict = true
        return apiError(409, 'PAYMENT_ATTEMPT_PENDING')
      }),
    )
    const user = userEvent.setup()
    renderPurchase()
    await user.click(await screen.findByRole('button', { name: 'Tạo mã QR thanh toán' }))
    expect(await screen.findByRole('heading', { name: 'Quét mã để thanh toán' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports an unavailable payment provider without claiming success', async () => {
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(payable())),
      http.get(currentUrl, () => current(null)),
      http.post(createUrl, () => apiError(503, 'PAYMENT_PROVIDER_UNAVAILABLE')),
    )
    const user = userEvent.setup()
    renderPurchase()
    await user.click(await screen.findByRole('button', { name: 'Tạo mã QR thanh toán' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cổng thanh toán đang gián đoạn')
    expect(screen.queryByRole('img', { name: 'Mã VietQR thanh toán' })).not.toBeInTheDocument()
  })

  it('shows a reload error instead of a create button while the attempt is unknown', async () => {
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(payable())),
      http.get(currentUrl, () => apiError(500, 'INTERNAL_ERROR')),
    )
    renderPurchase()
    expect(await screen.findByText('Chưa tải được thông tin thanh toán. Hãy tải lại trang.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo mã QR thanh toán' })).toBeDisabled()
  })

  it('does not offer a QR when the backend withholds CREATE_PAYMENT_ATTEMPT', async () => {
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(purchaseFixture())),
      http.get(currentUrl, () => current(null)),
    )
    renderPurchase()
    expect(await screen.findByRole('heading', { name: 'Thanh toán online chưa mở' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tạo mã QR/ })).not.toBeInTheDocument()
  })

  it.each(['FAILED', 'CANCELLED'] as const)('offers a new QR after a %s attempt and warns against the old one', async (displayStatus) => {
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(payable())),
      http.get(currentUrl, () => current(attemptFixture({ status: displayStatus, displayStatus }))),
    )
    renderPurchase()
    expect(await screen.findByRole('button', { name: 'Tạo mã QR mới' })).toBeInTheDocument()
    expect(screen.getByText(/Không chuyển khoản theo mã cũ/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Mã VietQR thanh toán' })).not.toBeInTheDocument()
  })

  it.each([
    ['EXPIRED', 'Đơn đã hết hạn'],
    ['PAID', 'Đã nhận tiền, đang kích hoạt'],
    ['CANCELLED', 'Đơn đã được hủy'],
  ] as const)('hides the QR once the purchase is %s', async (displayStatus, title) => {
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(payable({ status: displayStatus === 'EXPIRED' ? 'PENDING_PAYMENT' : displayStatus, displayStatus }))),
      http.get(currentUrl, () => current(attemptFixture())),
    )
    renderPurchase()
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Mã VietQR thanh toán' })).not.toBeInTheDocument()
  })

  it('"Tôi đã chuyển khoản" only reloads, and picks up the paid purchase and settled attempt', async () => {
    let paid = false
    let currentReads = 0
    let posts = 0
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () =>
        HttpResponse.json(paid ? payable({ status: 'PAID', displayStatus: 'PAID', paidAt: '2026-11-01T03:05:00Z', allowedActions: ['WAIT_ACTIVATION'], version: 1 }) : payable()),
      ),
      http.get(currentUrl, () => {
        currentReads += 1
        return current(paid ? attemptFixture({ status: 'SUCCESS', displayStatus: 'SUCCESS' }) : attemptFixture())
      }),
      http.post(createUrl, () => {
        posts += 1
        return HttpResponse.json(attemptFixture(), { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderPurchase()
    await screen.findByRole('heading', { name: 'Quét mã để thanh toán' })
    paid = true
    await user.click(screen.getByRole('button', { name: 'Tôi đã chuyển khoản' }))
    expect(await screen.findByRole('heading', { name: 'Đã nhận tiền, đang kích hoạt' })).toBeInTheDocument()
    await waitFor(() => expect(currentReads).toBeGreaterThanOrEqual(2))
    expect(posts).toBe(0)
  })

  it('creates the QR once on arrival from package selection', async () => {
    let posts = 0
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(payable())),
      http.get(currentUrl, () => current(posts > 0 ? attemptFixture() : null)),
      http.post(createUrl, () => {
        posts += 1
        return HttpResponse.json(attemptFixture(), { status: 201 })
      }),
    )
    renderPurchase({ autoPay: true })
    expect(await screen.findByRole('heading', { name: 'Đang tạo mã QR thanh toán' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Quét mã để thanh toán' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Mã VietQR thanh toán' })).toBeInTheDocument()
    expect(posts).toBe(1)
  })

  it('falls back to the manual button when the automatic create fails', async () => {
    let posts = 0
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(payable())),
      http.get(currentUrl, () => current(null)),
      http.post(createUrl, () => {
        posts += 1
        return apiError(503, 'PAYMENT_PROVIDER_UNAVAILABLE')
      }),
    )
    renderPurchase({ autoPay: true })
    expect(await screen.findByRole('alert')).toHaveTextContent('Cổng thanh toán đang gián đoạn')
    expect(screen.getByRole('button', { name: 'Tạo mã QR thanh toán' })).toBeEnabled()
    expect(posts).toBe(1)
  })

  it.each([
    ['the backend withholds CREATE_PAYMENT_ATTEMPT', purchaseFixture(), null, 'Thanh toán online chưa mở'],
    ['a previous attempt ended', payable(), attemptFixture({ status: 'FAILED', displayStatus: 'FAILED' }), 'Thanh toán bằng chuyển khoản'],
  ] as const)('does not auto-create when %s', async (_case, purchase, attempt, title) => {
    let posts = 0
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(purchase)),
      http.get(currentUrl, () => current(attempt)),
      http.post(createUrl, () => {
        posts += 1
        return HttpResponse.json(attemptFixture(), { status: 201 })
      }),
    )
    renderPurchase({ autoPay: true })
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    expect(posts).toBe(0)
  })

  it('warns before cancelling a purchase with an open QR', async () => {
    server.use(
      http.get(`${API}/subscription-purchases/:id`, () => HttpResponse.json(payable())),
      http.get(currentUrl, () => current(attemptFixture())),
    )
    const user = userEvent.setup()
    renderPurchase()
    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }))
    expect(screen.getByText(/Chỉ hủy nếu bạn chưa chuyển khoản/)).toBeInTheDocument()
  })
})

describe('purchasePollDelay', () => {
  it('polls only while a QR is open or activation is pending', () => {
    expect(purchasePollDelay(undefined, true, false)).toBe(false)
    expect(purchasePollDelay(payable(), false, false)).toBe(false)
    expect(purchasePollDelay(payable(), true, false)).toBe(4_000)
    expect(purchasePollDelay(payable({ status: 'PAID', displayStatus: 'PAID' }), false, false)).toBe(4_000)
    expect(purchasePollDelay(payable({ displayStatus: 'EXPIRED' }), true, false)).toBe(false)
    expect(purchasePollDelay(payable({ status: 'ACTIVATED', displayStatus: 'ACTIVATED' }), false, false)).toBe(false)
  })
  it('backs off after a failed fetch', () => {
    expect(purchasePollDelay(payable(), true, true)).toBe(15_000)
  })
})
