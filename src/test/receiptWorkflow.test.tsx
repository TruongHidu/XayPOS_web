import { StrictMode, type PropsWithChildren } from 'react'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { ReceiptPrintingProvider } from '../features/order/printing/ReceiptPrintingProvider'
import { ReceiptButton } from '../features/order/printing/ReceiptButton'
import type { Payment } from '../features/payment/schemas'
import { queryClient } from '../shared/api/queryClient'
import { api } from '../shared/api/httpClient'
import { QueryInvalidator } from '../shared/realtime/queryInvalidator'
import { orderKeys } from '../features/order/api/orderKeys'
import { useAuthStore } from '../features/auth/store/authStore'
import { useOrderDraftStore } from '../features/order/store/orderDraftStore'
import { operationKey, useOrderOperationState } from '../features/order/store/orderOperationState'
import { privateMenuItemSchema } from '../features/menu/schemas'
import type { Order } from '../features/order/types'
import { server } from './server'
import { deferred, settle } from './realtimeFixtures'
import {
  base,
  ids,
  itemFixture,
  makeOrder,
  orderHandlers,
  page,
  resetOrderTest,
  seedOrderAccess,
} from './orderFixtures'

let scope: string
const paidOrder = () => makeOrder({ status: 'COMPLETED', paymentStatus: 'PAID', paidAmount: 100000 })
const payment = (patch: Partial<Payment> = {}): Payment => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orderId: ids.order,
  paymentCode: 'PAY-PRINT-001',
  amount: 100000,
  currencyCode: 'VND',
  paymentMethod: 'CASH',
  confirmationSource: 'STAFF_MANUAL',
  provider: null,
  status: 'SUCCESS',
  referenceNo: null,
  requestedAt: '2026-10-29T05:00:00Z',
  paidAt: '2026-10-29T05:00:01Z',
  createdBy: ids.user,
  ...patch,
})
function Wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReceiptPrintingProvider>{children}</ReceiptPrintingProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}
function mount(order = makeOrder(), strict = false) {
  const ui = (
    <Wrapper>
      <ReceiptButton order={order} />
    </Wrapper>
  )
  return render(strict ? <StrictMode>{ui}</StrictMode> : ui)
}
async function printedRoot(calls = 1) {
  await waitFor(() => expect(window.print).toHaveBeenCalledTimes(calls))
  const root = document.getElementById('staff-receipt-print-root')!
  expect(root).not.toBeNull()
  expect(document.querySelector('.receipt-preview-paper')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Xác nhận và in' })).not.toBeInTheDocument()
  return root
}
async function printPaid(calls = 1) {
  await userEvent.setup().click(screen.getByRole('button', { name: 'In lại bill' }))
  return printedRoot(calls)
}
beforeEach(() => {
  scope = seedOrderAccess()
  server.use(...orderHandlers)
  vi.spyOn(window, 'print').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  resetOrderTest()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('Receipt preparation through existing REST and permissions', () => {
  it('loads a provisional snapshot, keeps duplicate menu identities and preserves draft/uncertain intent without mutations', async () => {
    const order = makeOrder()
    order.items = [
      ...order.items,
      {
        ...order.items[0],
        id: ids.table,
        itemName: 'Cùng món ở giá snapshot khác',
        quantity: 1,
        unitPrice: 60000,
        lineTotal: 60000,
      },
    ]
    const get = vi.fn(() => HttpResponse.json(order))
    server.use(http.get(base + '/orders/:id', get))
    const post = vi.spyOn(api, 'post')
    const patch = vi.spyOn(api, 'patch')
    const remove = vi.spyOn(api, 'delete')
    const draft = useOrderDraftStore.getState()
    draft.start({ serviceType: 'TAKEAWAY', tableSessionId: null, guestCount: 1 })
    draft.add(privateMenuItemSchema.parse(itemFixture))
    draft.fields({ note: 'giỏ đang soạn' })
    const lines = useOrderDraftStore.getState().lines
    const key = operationKey(scope, ids.order)
    const intent = {
      orderId: ids.order,
      key: 'keep-original-key',
      input: { expectedVersion: 5, submissionMode: 'SUBMIT' as const, items: [{ itemId: ids.item, quantity: 1 }] },
    }
    const appends = new Map([[key, intent]])
    useOrderOperationState.setState({ uncertain: new Set([key]), appends })
    mount(order)
    await userEvent.setup().click(screen.getByRole('button', { name: 'In tạm tính' }))
    const root = await printedRoot()
    expect(within(root).getByText('BILL TẠM TÍNH')).toBeInTheDocument()
    expect(within(root).getByText('Chưa xác nhận thanh toán')).toBeInTheDocument()
    expect(root.querySelectorAll('[data-order-item-id]')).toHaveLength(2)
    expect(within(root).queryByText('BILL ĐÃ THANH TOÁN')).not.toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(1)
    expect(post).not.toHaveBeenCalled()
    expect(patch).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(useOrderDraftStore.getState().lines).toBe(lines)
    expect(useOrderDraftStore.getState().metadata.note).toBe('giỏ đang soạn')
    expect(useOrderOperationState.getState().appends).toBe(appends)
    expect(useOrderOperationState.getState().uncertain.has(key)).toBe(true)
    expect(window.print).toHaveBeenCalledTimes(1)
  })
  it('reopens a completed paid bill after remount and does not invent cash tender fields', async () => {
    scope = seedOrderAccess(['ORDER_VIEW', 'PAYMENT_VIEW'], ['ORDER_MANAGEMENT', 'PAYMENT_MANAGEMENT'])
    const get = vi.fn(() => HttpResponse.json(paidOrder()))
    const payments = vi.fn(() => HttpResponse.json(page([payment()])))
    server.use(http.get(base + '/orders/:id', get), http.get(base + '/orders/:id/payments', payments))
    const view = mount(paidOrder())
    let root = await printPaid()
    expect(within(root).getByText('BẢN IN LẠI')).toBeInTheDocument()
    expect(within(root).getByText('Mã thanh toán: PAY-PRINT-001')).toBeInTheDocument()
    expect(within(root).queryByText('Khách đưa')).not.toBeInTheDocument()
    act(() => window.dispatchEvent(new Event('afterprint')))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'In bill' })).not.toBeInTheDocument())
    view.unmount()
    mount(paidOrder())
    root = await printPaid(2)
    expect(within(root).getByText('Mã thanh toán: PAY-PRINT-001')).toBeInTheDocument()
    expect(within(root).queryByText('Tiền thừa')).not.toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(2)
    expect(payments).toHaveBeenCalledTimes(2)
  })
  it('ORDER_VIEW-only staff can print verified paid totals without payment reads or creation privileges', async () => {
    scope = seedOrderAccess(['ORDER_VIEW'], ['ORDER_MANAGEMENT'])
    const payments = vi.fn(() => new HttpResponse(null, { status: 403 }))
    server.use(
      http.get(base + '/orders/:id', () => HttpResponse.json(paidOrder())),
      http.get(base + '/orders/:id/payments', payments),
    )
    mount(paidOrder())
    const root = await printPaid()
    expect(within(root).queryByLabelText('Giao dịch thanh toán')).not.toBeInTheDocument()
    expect(within(root).getByText('BILL ĐÃ THANH TOÁN')).toBeInTheDocument()
    expect(payments).not.toHaveBeenCalled()
  })
  it('searches later payment pages instead of choosing a leading FAILED or PENDING payment', async () => {
    scope = seedOrderAccess(['ORDER_VIEW', 'PAYMENT_VIEW'], ['ORDER_MANAGEMENT', 'PAYMENT_MANAGEMENT'])
    const pages: number[] = []
    server.use(
      http.get(base + '/orders/:id', () => HttpResponse.json(paidOrder())),
      http.get(base + '/orders/:id/payments', ({ request }) => {
        const index = Number(new URL(request.url).searchParams.get('page'))
        pages.push(index)
        return HttpResponse.json(
          index === 0
            ? page(
                [
                  payment({ status: 'FAILED', paymentCode: 'NOT-PAID' }),
                  payment({ status: 'PENDING', paymentCode: 'NOT-YET' }),
                ],
                0,
                2,
              )
            : page([payment()], 1, 2),
        )
      }),
    )
    mount(paidOrder())
    const root = await printPaid()
    expect(pages).toEqual([0, 1])
    expect(within(root).getByText('Mã thanh toán: PAY-PRINT-001')).toBeInTheDocument()
    expect(within(root).queryByText(/NOT-PAID|NOT-YET/)).not.toBeInTheDocument()
  })
  it('fails closed when SUCCESS payment belongs to another order instead of using order-only fallback', async () => {
    scope = seedOrderAccess(['ORDER_VIEW', 'PAYMENT_VIEW'], ['ORDER_MANAGEMENT', 'PAYMENT_MANAGEMENT'])
    server.use(
      http.get(base + '/orders/:id', () => HttpResponse.json(paidOrder())),
      http.get(base + '/orders/:id/payments', () => HttpResponse.json(page([payment({ orderId: ids.table })]))),
    )
    mount(paidOrder())
    await userEvent.setup().click(screen.getByRole('button', { name: 'In lại bill' }))
    const dialog = await screen.findByRole('dialog', { name: 'In bill' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Giao dịch chưa thành công hoặc không khớp/)
    expect(within(dialog).queryByRole('button', { name: 'Xác nhận và in' })).not.toBeInTheDocument()
    expect(within(dialog).queryByText('BILL ĐÃ THANH TOÁN')).not.toBeInTheDocument()
    expect(window.print).not.toHaveBeenCalled()
  })
  it('a delayed GET cannot replace a newer cached snapshot used for the bill', async () => {
    const gate = deferred<void>()
    const get = vi.fn(async () => {
      await gate.promise
      return HttpResponse.json(makeOrder({ version: 4, note: 'old response' }))
    })
    server.use(http.get(base + '/orders/:id', get))
    mount()
    await userEvent.setup().click(screen.getByRole('button', { name: 'In tạm tính' }))
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    act(() =>
      queryClient.setQueryData(orderKeys.detail(scope, ids.order), makeOrder({ version: 8, note: 'newest snapshot' })),
    )
    gate.resolve()
    const dialog = await screen.findByRole('dialog', { name: 'Kiểm tra bill' })
    expect(await within(dialog).findByText('Ghi chú: newest snapshot')).toBeInTheDocument()
    expect(within(dialog).queryByText('Ghi chú: old response')).not.toBeInTheDocument()
    expect(queryClient.getQueryData<Order>(orderKeys.detail(scope, ids.order))?.version).toBe(8)
    expect(window.print).not.toHaveBeenCalled()
  })
})

describe('Direct printing lifecycle and scope', () => {
  it('requires review when the saved order version and amount changed before the print action', async () => {
    const updated = makeOrder({ version: 6, totalAmount: 120000, note: 'Tổng tiền mới' })
    server.use(http.get(base + '/orders/:id', () => HttpResponse.json(updated)))
    mount(makeOrder())
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'In tạm tính' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kiểm tra bill' })
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/Dữ liệu đơn đã thay đổi/)
    expect(within(dialog).getByText('Ghi chú: Tổng tiền mới')).toBeInTheDocument()
    expect(window.print).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận và in' }))
    const root = await printedRoot()
    expect(within(root).getByText('Ghi chú: Tổng tiền mới')).toBeInTheDocument()
  })
  it('keeps a read failure retryable and prints on retry without a second confirmation or mutation', async () => {
    let failed = true
    const get = vi.fn(() =>
      failed ? HttpResponse.json({ code: 'INTERNAL_ERROR' }, { status: 503 }) : HttpResponse.json(makeOrder()),
    )
    server.use(http.get(base + '/orders/:id', get))
    const post = vi.spyOn(api, 'post')
    mount()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'In tạm tính' }))
    const dialog = await screen.findByRole('dialog', { name: 'In bill' })
    await within(dialog).findByRole('alert')
    expect(window.print).not.toHaveBeenCalled()
    expect(document.getElementById('staff-receipt-print-root')).toBeNull()
    failed = false
    await user.click(within(dialog).getByRole('button', { name: 'Tải lại bill' }))
    await printedRoot()
    expect(get).toHaveBeenCalledTimes(2)
    expect(post).not.toHaveBeenCalled()
  })
  it('allows a fresh explicit retry when the browser cannot open printing', async () => {
    vi.mocked(window.print).mockImplementationOnce(() => {
      throw new Error('Printing blocked')
    })
    mount()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'In tạm tính' }))
    const dialog = await screen.findByRole('dialog', { name: 'In bill' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Không thể mở hộp thoại in/)
    expect(document.getElementById('staff-receipt-print-root')).toBeNull()
    expect(document.body).not.toHaveAttribute('data-staff-receipt-print')
    await user.click(within(dialog).getByRole('button', { name: 'Tải lại bill' }))
    await printedRoot(2)
  })
  it('remote invalidation blocks print until reload and explicit acknowledgement of the new paid kind', async () => {
    const gate = deferred<void>()
    let order = makeOrder()
    const get = vi.fn(async () => {
      await gate.promise
      return HttpResponse.json(order)
    })
    server.use(http.get(base + '/orders/:id', get))
    queryClient.setQueryData(orderKeys.detail(scope, ids.order), order)
    mount(order)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'In tạm tính' }))
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    order = makeOrder({ ...paidOrder(), version: 6 })
    const invalidator = new QueryInvalidator(
      queryClient,
      (query) => query.queryKey[0] === 'cashier' && query.queryKey[1] === scope,
      undefined,
      100000,
    )
    act(() => invalidator.invalidate(orderKeys.detail(scope, ids.order), true))
    gate.resolve()
    const dialog = await screen.findByRole('dialog', { name: 'Kiểm tra bill' })
    expect(
      within(dialog)
        .getAllByRole('alert')
        .some((alert) => alert.textContent?.includes('Đơn đã thay đổi')),
    ).toBe(true)
    expect(window.print).not.toHaveBeenCalled()
    invalidator.dispose()
    await user.click(within(dialog).getByRole('button', { name: 'Tải lại bill' }))
    await within(dialog).findByText('BILL ĐÃ THANH TOÁN')
    expect(window.print).not.toHaveBeenCalled()
    await user.click(await within(dialog).findByRole('button', { name: 'Xác nhận và in' }))
    const root = await printedRoot()
    expect(within(root).getByText('BILL ĐÃ THANH TOÁN')).toBeInTheDocument()
  })
  it.each(['close', 'logout', 'account switch'] as const)(
    '%s during GET ignores the late response and never prints old data',
    async (action) => {
      const gate = deferred<void>()
      const get = vi.fn(async () => {
        await gate.promise
        return HttpResponse.json(makeOrder())
      })
      server.use(http.get(base + '/orders/:id', get))
      mount()
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'In tạm tính' }))
      await waitFor(() => expect(get).toHaveBeenCalledTimes(1))
      if (action === 'close') await user.click(screen.getByRole('button', { name: 'Đóng in bill' }))
      else if (action === 'logout') act(() => useAuthStore.getState().clearSession())
      else
        act(() =>
          useAuthStore.setState((state) => ({ user: state.user ? { ...state.user, id: 'different-user' } : null })),
        )
      gate.resolve()
      await act(settle)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(document.getElementById('staff-receipt-print-root')).toBeNull()
      expect(window.print).not.toHaveBeenCalled()
    },
  )
  it('double-click prints one frozen root, then afterprint removes it without a success claim or mutation', async () => {
    let order = makeOrder({ note: 'chốt bản đang in' })
    server.use(http.get(base + '/orders/:id', () => HttpResponse.json(order)))
    const post = vi.spyOn(api, 'post')
    mount(order, true)
    const user = userEvent.setup()
    expect(window.print).not.toHaveBeenCalled()
    await user.dblClick(screen.getByRole('button', { name: 'In tạm tính' }))
    const root = await printedRoot()
    expect(document.querySelectorAll('#staff-receipt-print-root')).toHaveLength(1)
    expect(document.body).toHaveAttribute('data-staff-receipt-print')
    expect(within(root).getByText('Ghi chú: chốt bản đang in')).toBeInTheDocument()
    order = makeOrder({ version: 6, note: 'remote changed during native dialog' })
    act(() => queryClient.setQueryData(orderKeys.detail(scope, ids.order), order))
    expect(within(root).queryByText(/remote changed/)).not.toBeInTheDocument()
    expect(window.print).toHaveBeenCalledTimes(1)
    act(() => window.dispatchEvent(new Event('afterprint')))
    await waitFor(() => expect(document.getElementById('staff-receipt-print-root')).toBeNull())
    expect(document.body).not.toHaveAttribute('data-staff-receipt-print')
    expect(screen.queryByText(/đã in thành công/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })
})
