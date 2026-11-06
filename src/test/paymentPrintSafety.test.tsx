import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { PaymentModal } from '../features/payment/components/PaymentModal'
import type { Payment } from '../features/payment/schemas'
import { ReceiptPrintingProvider } from '../features/order/printing/ReceiptPrintingProvider'
import { orderKeys } from '../features/order/api/orderKeys'
import { queryClient } from '../shared/api/queryClient'
import { server } from './server'
import { allFeatures, allPermissions, base, ids, makeOrder, resetOrderTest, seedOrderAccess } from './orderFixtures'

const initial = makeOrder({ status: 'CONFIRMED' })
const paidOrder = () =>
  makeOrder({
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    paidAmount: 100000,
    version: 6,
  })
const payment = (patch: Partial<Payment> = {}): Payment => ({
  id: '88888888-8888-4888-8888-888888888888',
  orderId: ids.order,
  paymentCode: 'PAY-PRINT-SAFETY',
  amount: 100000,
  currencyCode: 'VND',
  paymentMethod: 'CASH',
  confirmationSource: 'STAFF_MANUAL',
  provider: null,
  status: 'SUCCESS',
  referenceNo: null,
  requestedAt: '2026-10-29T01:00:00Z',
  paidAt: '2026-10-29T01:00:00Z',
  createdBy: ids.user,
  ...patch,
})

let scope: string
beforeEach(() => {
  scope = seedOrderAccess(
    [...allPermissions, 'PAYMENT_CREATE', 'PAYMENT_CONFIRM'],
    [...allFeatures, 'PAYMENT_MANAGEMENT'],
  )
  vi.spyOn(window, 'print').mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup()
  resetOrderTest()
  vi.restoreAllMocks()
})

function mount() {
  const onSuccess = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReceiptPrintingProvider>
          <PaymentModal order={initial} onClose={() => {}} onSuccess={onSuccess} />
        </ReceiptPrintingProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onSuccess }
}

async function recordPayment() {
  const user = userEvent.setup()
  const confirm = await screen.findByRole('button', { name: /Xác nhận thu/ })
  await waitFor(() => expect(confirm).toBeEnabled())
  await user.click(confirm)
  return user
}

describe('Payment confirmation and receipt safety', () => {
  it.each([
    ['PENDING', { status: 'PENDING', paidAt: null }],
    ['FAILED', { status: 'FAILED', paidAt: null }],
    ['CANCELLED', { status: 'CANCELLED', paidAt: null }],
    ['wrong order', { orderId: ids.table }],
    ['wrong currency', { currencyCode: 'USD' }],
    ['wrong amount', { amount: 99000 }],
    ['missing paidAt', { paidAt: null }],
  ] satisfies [string, Partial<Payment>][])(
    'does not treat %s as paid or offer a paid receipt',
    async (_label, patch) => {
      let posts = 0
      server.use(
        http.get(base + '/orders/:id', () => HttpResponse.json(initial)),
        http.post(base + '/orders/:id/payments', () => {
          posts++
          return HttpResponse.json(payment(patch), { status: 201 })
        }),
      )
      const { onSuccess } = mount()
      await recordPayment()
      await screen.findByRole('button', { name: 'Kiểm tra bằng yêu cầu thanh toán ban đầu' })
      expect(screen.queryByRole('dialog', { name: 'Thanh toán thành công' })).not.toBeInTheDocument()
      expect(screen.queryByText('Đã ghi nhận thanh toán')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /In bill/ })).not.toBeInTheDocument()
      expect(screen.queryByText('BILL ĐÃ THANH TOÁN')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Xác nhận thu/ })).not.toBeInTheDocument()
      expect(onSuccess).not.toHaveBeenCalled()
      expect(window.print).not.toHaveBeenCalled()
      expect(posts).toBe(1)
    },
  )

  it('prints once on the receipt action using its successful payment response without requiring PAYMENT_VIEW', async () => {
    let recorded = false
    let posts = 0
    const paymentGets = vi.fn()
    server.use(
      http.get(base + '/orders/:id', () => HttpResponse.json(recorded ? paidOrder() : initial)),
      http.get(base + '/orders/:id/payments', () => {
        paymentGets()
        return HttpResponse.json({ code: 'FORBIDDEN' }, { status: 403 })
      }),
      http.post(base + '/orders/:id/payments', () => {
        recorded = true
        posts++
        return HttpResponse.json(payment(), { status: 201 })
      }),
    )
    const { onSuccess } = mount()
    const user = await recordPayment()
    await screen.findByRole('dialog', { name: 'Thanh toán thành công' })
    expect(window.print).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /In bill/ }))
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1))
    const root = document.getElementById('staff-receipt-print-root')!
    expect(within(root).getByText('BILL ĐÃ THANH TOÁN')).toBeInTheDocument()
    expect(within(root).getByText(/PAY-PRINT-SAFETY/)).toBeInTheDocument()
    expect(document.querySelector('.receipt-preview-paper')).toBeNull()
    expect(paymentGets).not.toHaveBeenCalled()
    expect(posts).toBe(1)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    act(() => window.dispatchEvent(new Event('afterprint')))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'In bill' })).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'Thanh toán thành công' })).toBeInTheDocument()
    expect(posts).toBe(1)
  })

  it('keeps confirmed payment when the follow-up order GET fails and retries only the read before printing', async () => {
    let recorded = false
    let failOrderRead = true
    let posts = 0
    let orderReadsAfterPayment = 0
    server.use(
      http.get(base + '/orders/:id', () => {
        if (!recorded) return HttpResponse.json(initial)
        orderReadsAfterPayment++
        return failOrderRead
          ? HttpResponse.json({ code: 'INTERNAL_ERROR' }, { status: 503 })
          : HttpResponse.json(paidOrder())
      }),
      http.post(base + '/orders/:id/payments', () => {
        recorded = true
        posts++
        return HttpResponse.json(payment(), { status: 201 })
      }),
    )
    mount()
    const user = await recordPayment()
    await screen.findByRole('dialog', { name: 'Thanh toán thành công' })
    expect(screen.getByText(/PAY-PRINT-SAFETY/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Xác nhận thu/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kiểm tra bằng yêu cầu thanh toán ban đầu' })).not.toBeInTheDocument()
    expect(screen.queryByText('BILL ĐÃ THANH TOÁN')).not.toBeInTheDocument()
    expect(window.print).not.toHaveBeenCalled()
    expect(posts).toBe(1)
    expect(orderReadsAfterPayment).toBeGreaterThan(0)
    failOrderRead = false
    await user.click(screen.getByRole('button', { name: 'Tải lại đơn để in' }))
    const printButton = await screen.findByRole('button', { name: /In bill/ })
    await waitFor(() => expect(printButton).toBeEnabled())
    await user.click(printButton)
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1))
    const root = document.getElementById('staff-receipt-print-root')!
    expect(within(root).getByText('BILL ĐÃ THANH TOÁN')).toBeInTheDocument()
    expect(within(root).getByText(/PAY-PRINT-SAFETY/)).toBeInTheDocument()
    expect(posts).toBe(1)
  })

  it('explicit network replay preserves original body, key and expected version despite a newer cached order', async () => {
    const requests: { body: unknown; key: string | null }[] = []
    let recorded = false
    server.use(
      http.get(base + '/orders/:id', () => HttpResponse.json(recorded ? paidOrder() : initial)),
      http.post(base + '/orders/:id/payments', async ({ request }) => {
        requests.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') })
        if (requests.length === 1) return HttpResponse.error()
        recorded = true
        return HttpResponse.json(payment(), { headers: { 'Idempotency-Replayed': 'true' } })
      }),
    )
    mount()
    const user = await recordPayment()
    const replay = await screen.findByRole('button', { name: 'Kiểm tra bằng yêu cầu thanh toán ban đầu' })
    act(() =>
      queryClient.setQueryData(orderKeys.detail(scope, ids.order), makeOrder({ status: 'CONFIRMED', version: 9 })),
    )
    await user.click(replay)
    await screen.findByRole('dialog', { name: 'Thanh toán thành công' })
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    expect(requests[1].key).toBeTruthy()
    expect(requests[1].body).toEqual({ expectedOrderVersion: 5, paymentMethod: 'CASH', amount: 100000 })
    expect(window.print).not.toHaveBeenCalled()
  })
})
