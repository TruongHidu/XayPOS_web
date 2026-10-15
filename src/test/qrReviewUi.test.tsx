import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import { queryClient } from '../shared/api/queryClient'
import { OrderListPage } from '../features/order/pages/OrderListPage'
import { QrReviewModal } from '../features/qr-order-review/components/QrReviewModal'
import { base, failure, ids, orderHandlers, page, resetOrderTest, seedOrderAccess } from './orderFixtures'
import { reviewApproval, reviewDetail, reviewHash, reviewId, reviewSummary } from './qrReviewFixtures'

function mount(ui = <OrderListPage />) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}
describe('Cashier QR request inbox and decisions', () => {
  beforeEach(() => {
    seedOrderAccess()
    server.use(
      http.get(base + '/qr-order-requests', () => HttpResponse.json(page([reviewSummary()]))),
      http.get(base + '/qr-order-requests/:id', () => HttpResponse.json(reviewDetail())),
      http.get(base + '/orders', () => HttpResponse.json(page([]))),
      ...orderHandlers,
    )
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    resetOrderTest()
  })

  it('shows customer requests in the pending column and refreshes serving orders after approval', async () => {
    const user = userEvent.setup()
    let approved = false
    let approvalBody: unknown
    server.use(
      http.get(base + '/qr-order-requests', () => HttpResponse.json(page(approved ? [] : [reviewSummary()]))),
      http.get(base + '/orders', ({ request }) =>
        HttpResponse.json(
          page(
            approved && new URL(request.url).searchParams.get('status') === 'CONFIRMED' ? [reviewApproval().order] : [],
          ),
        ),
      ),
      http.post(base + '/qr-order-requests/:id/approve', async ({ request }) => {
        approvalBody = await request.json()
        approved = true
        return HttpResponse.json(reviewApproval())
      }),
    )
    mount()
    const pending = screen.getByRole('region', { name: 'Chờ xử lý' })
    expect(await within(pending).findByText('Phở khách gọi QR', { exact: false })).toBeInTheDocument()
    await user.click(within(pending).getByRole('button', { name: 'Xem và xác nhận' }))
    const modal = await screen.findByRole('dialog')
    expect(await within(modal).findByText('Giá xác nhận hiện tại')).toBeInTheDocument()
    expect(within(modal).getByText(/mở phiên bàn mới/)).toBeInTheDocument()
    await user.click(within(modal).getByRole('button', { name: 'Xác nhận yêu cầu' }))
    expect(await screen.findByText('Đã xác nhận yêu cầu QR vào đơn OD-QR-001.')).toBeInTheDocument()
    expect(approvalBody).toEqual({
      expectedRequestVersion: 2,
      expectedReviewContextHash: reviewHash,
      targetSessionId: null,
    })
    expect(
      await within(screen.getByRole('region', { name: 'Đang chế biến' })).findByText('OD-QR-001'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(within(pending).queryByRole('button', { name: 'Xem và xác nhận' })).not.toBeInTheDocument(),
    )
  })
  it('requires a group check before adding to the reviewed existing session', async () => {
    const user = userEvent.setup()
    let body: unknown
    const current = reviewDetail({
      reviewContext: {
        currentSessionId: ids.session,
        tableAccessEpoch: 2,
        sessionVersion: 8,
        guestCount: 2,
        currentOrder: {
          id: ids.order,
          version: 5,
          status: 'CONFIRMED',
          paymentStatus: 'UNPAID',
          currencyCode: 'VND',
          totalAmount: 50000,
          paidAmount: 0,
        },
      },
    })
    server.use(
      http.get(base + '/qr-order-requests/:id', () => HttpResponse.json(current)),
      http.post(base + '/qr-order-requests/:id/approve', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(reviewApproval())
      }),
    )
    const onDone = vi.fn()
    mount(<QrReviewModal requestId={reviewId} onClose={() => {}} onDone={onDone} />)
    const button = await screen.findByRole('button', { name: 'Xác nhận yêu cầu' })
    expect(button).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /đúng nhóm khách/ }))
    await user.click(button)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(body).toEqual({
      expectedRequestVersion: 2,
      expectedReviewContextHash: reviewHash,
      targetSessionId: ids.session,
    })
  })
  it('approves a separate takeaway order without TABLE_OPEN or POS_QUICK_ORDER', async () => {
    seedOrderAccess(
      ['ORDER_VIEW', 'ORDER_CREATE', 'ORDER_UPDATE'],
      ['ORDER_MANAGEMENT', 'QR_MENU_VIEW', 'QR_STATIC_ORDER'],
    )
    const user = userEvent.setup()
    const request = reviewSummary({
      entryType: 'RESTAURANT',
      serviceType: 'TAKEAWAY',
      sourceChannel: 'QR_STATIC',
      tableId: null,
    })
    let body: unknown
    server.use(
      http.get(base + '/qr-order-requests/:id', () =>
        HttpResponse.json(reviewDetail({ request, reviewContext: null })),
      ),
      http.post(base + '/qr-order-requests/:id/approve', async ({ request: incoming }) => {
        body = await incoming.json()
        return HttpResponse.json(reviewApproval(true))
      }),
    )
    const onDone = vi.fn()
    mount(<QrReviewModal requestId={reviewId} onClose={() => {}} onDone={onDone} />)
    await user.click(await screen.findByRole('button', { name: 'Xác nhận yêu cầu' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(body).toMatchObject({ targetSessionId: null })
  })
  it('rejects with a required trimmed reason and the displayed request version', async () => {
    const user = userEvent.setup()
    let body: unknown
    server.use(
      http.post(base + '/qr-order-requests/:id/reject', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(reviewSummary({ status: 'REJECTED', version: 3, rejectionReason: 'Nhà hàng hết món' }))
      }),
    )
    const onDone = vi.fn()
    mount(<QrReviewModal requestId={reviewId} onClose={() => {}} onDone={onDone} />)
    await user.click(await screen.findByText('Từ chối yêu cầu', { selector: 'summary' }))
    expect(screen.getByRole('button', { name: 'Xác nhận từ chối' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Lý do từ chối' }), '  Nhà hàng hết món  ')
    await user.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(body).toEqual({ expectedRequestVersion: 2, reason: 'Nhà hàng hết món' })
  })
  it('requires a new review after a price/session conflict and sends the new reviewed hash', async () => {
    const user = userEvent.setup()
    let calls = 0
    let changed = false
    let body: unknown
    const newHash = 'b'.repeat(64)
    server.use(
      http.get(base + '/qr-order-requests/:id', () =>
        HttpResponse.json(
          reviewDetail(
            changed
              ? {
                  reviewContextHash: newHash,
                  currentQuote: {
                    currencyCode: 'VND',
                    amount: 120000,
                    lines: [{ ...reviewSummary().items[0], unitPrice: 60000, lineTotal: 120000 }],
                  },
                }
              : {},
          ),
        ),
      ),
      http.post(base + '/qr-order-requests/:id/approve', async ({ request }) => {
        calls++
        body = await request.json()
        if (calls === 1) {
          changed = true
          return failure('QR_REVIEW_CONTEXT_CHANGED')
        }
        return HttpResponse.json(reviewApproval())
      }),
    )
    const onDone = vi.fn()
    mount(<QrReviewModal requestId={reviewId} onClose={() => {}} onDone={onDone} />)
    await user.click(await screen.findByRole('button', { name: 'Xác nhận yêu cầu' }))
    expect(await screen.findByText(/Giá món hoặc phiên bàn đã thay đổi/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xác nhận yêu cầu' })).toBeDisabled()
    expect(calls).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Đọc lại yêu cầu' }))
    expect(await screen.findByText(/Giá đã thay đổi so với lúc khách gửi/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Xác nhận yêu cầu' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(body).toMatchObject({ expectedReviewContextHash: newHash })
  })
  it('does not repeat an uncertain decision; re-reading can reveal another staff approval', async () => {
    const user = userEvent.setup()
    let calls = 0
    let uncertain = false
    server.use(
      http.get(base + '/qr-order-requests/:id', () =>
        HttpResponse.json(
          reviewDetail(
            uncertain
              ? {
                  request: reviewSummary({ status: 'APPROVED', version: 3, approvedOrderId: ids.order }),
                  canApprove: false,
                  reviewContextHash: null,
                  currentQuote: null,
                  reasonCode: 'INVALID_QR_REQUEST_TRANSITION',
                }
              : {},
          ),
        ),
      ),
      http.post(base + '/qr-order-requests/:id/approve', () => {
        calls++
        uncertain = true
        return failure('INTERNAL_ERROR', 503)
      }),
    )
    mount(<QrReviewModal requestId={reviewId} onClose={() => {}} onDone={() => {}} />)
    await user.click(await screen.findByRole('button', { name: 'Xác nhận yêu cầu' }))
    expect(await screen.findByText(/Đọc lại yêu cầu trước khi quyết định tiếp/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Đọc lại yêu cầu' }))
    expect(await screen.findByText('Đã xác nhận')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác nhận yêu cầu' })).not.toBeInTheDocument()
    expect(calls).toBe(1)
  })
  it('allows read-only staff to inspect the queue without exposing decision actions', async () => {
    seedOrderAccess(['ORDER_VIEW'], ['ORDER_MANAGEMENT'])
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Xem và xác nhận' }))
    expect(await screen.findByRole('button', { name: 'Xác nhận yêu cầu' })).toBeDisabled()
    expect(screen.queryByText('Từ chối yêu cầu', { selector: 'summary' })).not.toBeInTheDocument()
  })
  it('keeps decisions blocked when a manual reread fails, even with a cached quote', async () => {
    const user = userEvent.setup()
    let failing = false
    server.use(
      http.get(base + '/qr-order-requests/:id', () =>
        failing ? failure('INTERNAL_ERROR', 503) : HttpResponse.json(reviewDetail()),
      ),
    )
    mount(<QrReviewModal requestId={reviewId} onClose={() => {}} onDone={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Xác nhận yêu cầu' })).toBeEnabled()
    failing = true
    await user.click(screen.getByRole('button', { name: 'Đọc lại yêu cầu' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xác nhận yêu cầu' })).toBeDisabled()
    failing = false
    await user.click(screen.getByRole('button', { name: 'Đọc lại yêu cầu' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận yêu cầu' })).toBeEnabled())
  })
  it('polls new customer requests while the order screen is open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let arrived = false
    server.use(http.get(base + '/qr-order-requests', () => HttpResponse.json(page(arrived ? [reviewSummary()] : []))))
    mount()
    expect(await screen.findByText('Chưa có yêu cầu QR chờ xác nhận.')).toBeInTheDocument()
    arrived = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(await screen.findByRole('button', { name: 'Xem và xác nhận' })).toBeInTheDocument()
  })
  it('disables approval when the request expires while the review is open', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    server.use(
      http.get(base + '/qr-order-requests/:id', () =>
        HttpResponse.json(
          reviewDetail({ request: reviewSummary({ expiresAt: new Date(Date.now() + 1500).toISOString() }) }),
        ),
      ),
    )
    mount(<QrReviewModal requestId={reviewId} onClose={() => {}} onDone={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Xác nhận yêu cầu' })).toBeEnabled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(screen.getByRole('button', { name: 'Xác nhận yêu cầu' })).toBeDisabled()
    expect(screen.getByText(/Chờ xác nhận · Đã hết hạn/)).toBeInTheDocument()
  })
})
