import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import { queryClient } from '../shared/api/queryClient'
import { QrReviewModal } from '../features/qr-order-review/components/QrReviewModal'
import { qrReviewDetailSchema } from '../features/qr-order-review/schemas'
import {
  acceptedTotal,
  chooseLine,
  excludedItemsOf,
  initialSelection,
  missingReason,
  untickMenuItems,
} from '../features/qr-order-review/utils/qrReviewSelection'
import { base, failure, orderHandlers, resetOrderTest, seedOrderAccess } from './orderFixtures'
import { quoteLine, reviewApproval, reviewDetail, reviewId, reviewSummary } from './qrReviewFixtures'

const pho = '11111111-aaaa-4aaa-8aaa-000000000001'
const tea = '11111111-aaaa-4aaa-8aaa-000000000002'
const phoItem = '22222222-bbbb-4bbb-8bbb-000000000001'
const teaItem = '22222222-bbbb-4bbb-8bbb-000000000002'

/** Two lines: Phở (100.000) and Trà đá (10.000). */
function twoLineRequest(patch: Parameters<typeof reviewSummary>[0] = {}) {
  const first = reviewSummary().items[0]
  return reviewSummary({
    estimatedAmount: 110000,
    items: [
      { ...first, id: pho, itemId: phoItem, itemName: 'Phở', note: null },
      {
        ...first,
        id: tea,
        itemId: teaItem,
        itemName: 'Trà đá',
        unit: 'ly',
        quantity: 2,
        unitPrice: 5000,
        lineTotal: 10000,
        note: null,
      },
    ],
    ...patch,
  })
}
function detailWith(teaPatch: Parameters<typeof quoteLine>[1] = {}, patch: Parameters<typeof reviewDetail>[0] = {}) {
  const request = twoLineRequest()
  const [phoLine, teaLine] = request.items
  const teaQuote = quoteLine(teaLine, teaPatch)
  return reviewDetail({
    request,
    currentQuote: {
      currencyCode: 'VND',
      amount: teaQuote.available ? 110000 : 100000,
      lines: [quoteLine(phoLine), teaQuote],
    },
    ...patch,
  })
}
const soldOut = { available: false, unavailableReason: 'ITEM_OUT_OF_STOCK', unitPrice: null, lineTotal: null }

function mount() {
  const onDone = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QrReviewModal requestId={reviewId} onClose={() => {}} onDone={onDone} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return onDone
}

describe('QR review line selection', () => {
  const lines = detailWith(soldOut).currentQuote!.lines
  it('leaves unavailable lines out with a guest reason and keeps staff choices on re-read', () => {
    const first = initialSelection(lines)
    expect(first[pho]).toEqual({ accept: true, reason: '' })
    expect(first[tea]).toEqual({ accept: false, reason: 'Món đã hết' })
    expect(acceptedTotal(lines, first)).toBe(10000000n)
    // Staff leave Phở out too; after a re-read where Trà đá is back, Phở stays out.
    const chosen = chooseLine(first, pho, false)
    const reread = initialSelection(detailWith().currentQuote!.lines, chosen)
    expect(reread[pho]).toEqual({ accept: false, reason: 'Món đã hết' })
    expect(reread[tea]).toEqual({ accept: false, reason: 'Món đã hết' })
  })
  it('sends no excludedItems when every line is taken and requires a reason for each left-out line', () => {
    const all = detailWith().currentQuote!.lines
    expect(excludedItemsOf(all, initialSelection(all))).toBeUndefined()
    const blank = { ...chooseLine(initialSelection(all), tea, false), [tea]: { accept: false, reason: '  ' } }
    expect(missingReason(all, blank)).toBe(true)
    expect(excludedItemsOf(all, chooseLine(initialSelection(all), tea, false))).toEqual([
      { requestItemId: tea, reason: 'Món đã hết' },
    ])
    expect(untickMenuItems(initialSelection(all), all, [phoItem])[pho].accept).toBe(false)
  })
  it('parses an unavailable line without price but refuses an available one without price', () => {
    expect(qrReviewDetailSchema.safeParse(detailWith(soldOut)).success).toBe(true)
    const broken = detailWith()
    broken.currentQuote!.lines[1] = { ...broken.currentQuote!.lines[1], unitPrice: null, lineTotal: null }
    expect(qrReviewDetailSchema.safeParse(broken).success).toBe(false)
  })
})

describe('QR review partial approval', () => {
  let approveBody: unknown
  beforeEach(() => {
    seedOrderAccess()
    approveBody = undefined
    server.use(
      ...orderHandlers,
      http.post(base + '/qr-order-requests/:id/approve', async ({ request }) => {
        approveBody = await request.json()
        return HttpResponse.json(reviewApproval())
      }),
    )
  })
  afterEach(() => {
    cleanup()
    resetOrderTest()
  })

  it('leaves a sold-out line out, locked, and approves the rest with its reason', async () => {
    server.use(http.get(base + '/qr-order-requests/:id', () => HttpResponse.json(detailWith(soldOut))))
    const user = userEvent.setup()
    const onDone = mount()
    const teaBox = await screen.findByRole('checkbox', { name: 'Nhận món Trà đá' })
    expect(teaBox).not.toBeChecked()
    expect(teaBox).toBeDisabled()
    expect(screen.getByText('Hết hàng')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Lý do bỏ Trà đá' })).toHaveValue('Món đã hết')
    expect(screen.getByText('Tạm tính các món được nhận (1/2 món)')).toBeInTheDocument()
    // Leaving a line out is not a price change.
    expect(screen.queryByText(/Giá đã thay đổi/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Xác nhận 1/2 món' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(approveBody).toMatchObject({ excludedItems: [{ requestItemId: tea, reason: 'Món đã hết' }] })
  })

  it('needs a reason for an available line staff leave out', async () => {
    server.use(http.get(base + '/qr-order-requests/:id', () => HttpResponse.json(detailWith())))
    const user = userEvent.setup()
    const onDone = mount()
    await user.click(await screen.findByRole('checkbox', { name: 'Nhận món Trà đá' }))
    const reason = screen.getByRole('textbox', { name: 'Lý do bỏ Trà đá' })
    await user.clear(reason)
    expect(screen.getByRole('button', { name: 'Xác nhận 1/2 món' })).toBeDisabled()
    await user.type(reason, 'Hết đá, xin lỗi bạn')
    await user.click(screen.getByRole('button', { name: 'Xác nhận 1/2 món' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(approveBody).toMatchObject({ excludedItems: [{ requestItemId: tea, reason: 'Hết đá, xin lỗi bạn' }] })
  })

  it('turns into a rejection when every line is left out', async () => {
    let rejectBody: unknown
    server.use(
      http.get(base + '/qr-order-requests/:id', () => HttpResponse.json(detailWith(soldOut))),
      http.post(base + '/qr-order-requests/:id/reject', async ({ request }) => {
        rejectBody = await request.json()
        return HttpResponse.json(twoLineRequest({ status: 'REJECTED', version: 3, rejectionReason: 'Món đã hết' }))
      }),
    )
    const user = userEvent.setup()
    const onDone = mount()
    await user.click(await screen.findByRole('checkbox', { name: 'Nhận món Phở' }))
    expect(screen.queryByRole('button', { name: /^Xác nhận (yêu cầu|\d)/ })).not.toBeInTheDocument()
    expect(screen.getByText('Không nhận món nào')).toBeInTheDocument()
    // One reason, in the rejection form; the per-line reason boxes step aside.
    expect(screen.queryByRole('textbox', { name: /^Lý do bỏ/ })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Lý do gửi khách' })).toHaveValue('Món đã hết')
    expect(screen.getByText('Khách sẽ thấy lý do này.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Từ chối và báo khách' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(rejectBody).toEqual({ expectedRequestVersion: 2, reason: 'Món đã hết' })
  })

  it('a single dish short of stock: one notice and rejecting needs no re-check', async () => {
    const request = twoLineRequest()
    const single = reviewSummary({ estimatedAmount: 100000, items: [request.items[0]] })
    let rejectBody: unknown
    server.use(
      http.get(base + '/qr-order-requests/:id', () =>
        HttpResponse.json(
          reviewDetail({
            request: single,
            currentQuote: { currencyCode: 'VND', amount: 100000, lines: [quoteLine(single.items[0])] },
          }),
        ),
      ),
      http.post(base + '/qr-order-requests/:id/approve', () =>
        failure('INSUFFICIENT_AVAILABLE_STOCK', 409, {
          lines: [
            {
              orderItemId: '99999999-9999-4999-8999-999999999999',
              menuItemId: phoItem,
              itemName: 'Phở',
              requestedQuantity: 2,
              maxAvailableQuantity: 0,
              unit: 'tô',
              sharesIngredientWithOtherLines: false,
            },
          ],
        }),
      ),
      http.post(base + '/qr-order-requests/:id/reject', async ({ request }) => {
        rejectBody = await request.json()
        return HttpResponse.json(reviewSummary({ status: 'REJECTED', version: 3, rejectionReason: 'Món đã hết' }))
      }),
    )
    const user = userEvent.setup()
    const onDone = mount()
    await user.click(await screen.findByRole('button', { name: 'Xác nhận yêu cầu' }))
    expect(await screen.findByText(/Không còn món nào để nhận. Hãy từ chối và báo khách./)).toBeInTheDocument()
    expect(screen.queryByText(/Kiểm tra lại trước khi quyết định/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Xác nhận sẽ tạo/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Chuyển sang từ chối' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Từ chối và báo khách' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(rejectBody).toEqual({ expectedRequestVersion: 2, reason: 'Món đã hết' })
  })

  it('only offers rejection when every line is unavailable', async () => {
    const request = twoLineRequest()
    server.use(
      http.get(base + '/qr-order-requests/:id', () =>
        HttpResponse.json(
          reviewDetail({
            request,
            currentQuote: {
              currencyCode: 'VND',
              amount: 0,
              lines: request.items.map((item) => quoteLine(item, soldOut)),
            },
            canApprove: false,
            reasonCode: 'ITEM_OUT_OF_STOCK',
          }),
        ),
      ),
    )
    mount()
    expect(
      await screen.findByText(/Tất cả món trong yêu cầu đều đã hết hoặc ngừng bán, chỉ có thể từ chối/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Nhận món/ })).not.toBeInTheDocument()
  })

  it('leaves out dishes short of stock, then approves the rest after a re-read', async () => {
    server.use(
      http.get(base + '/qr-order-requests/:id', () => HttpResponse.json(detailWith())),
      http.post(base + '/qr-order-requests/:id/approve', async ({ request }) => {
        const body = (await request.json()) as { excludedItems?: unknown }
        if (!body.excludedItems)
          return failure('INSUFFICIENT_AVAILABLE_STOCK', 409, {
            lines: [
              {
                orderItemId: '99999999-9999-4999-8999-999999999999',
                menuItemId: teaItem,
                itemName: 'Trà đá',
                requestedQuantity: 2,
                maxAvailableQuantity: 0,
                unit: 'ly',
                sharesIngredientWithOtherLines: false,
              },
            ],
          })
        approveBody = body
        return HttpResponse.json(reviewApproval())
      }),
    )
    const user = userEvent.setup()
    const onDone = mount()
    await user.click(await screen.findByRole('button', { name: 'Xác nhận yêu cầu' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/Trà đá: đã hết/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Nhận món Trà đá' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Kiểm tra lại yêu cầu' }))
    await user.click(await screen.findByRole('button', { name: 'Xác nhận 1/2 món' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(approveBody).toMatchObject({ excludedItems: [{ requestItemId: tea, reason: 'Món đã hết' }] })
  })

  it('re-reads after QR_LINE_UNAVAILABLE and leaves the newly sold-out line out', async () => {
    let soldOutNow = false
    server.use(
      http.get(base + '/qr-order-requests/:id', () =>
        HttpResponse.json(
          detailWith(soldOutNow ? soldOut : {}, soldOutNow ? { reviewContextHash: 'c'.repeat(64) } : {}),
        ),
      ),
      http.post(base + '/qr-order-requests/:id/approve', () => {
        soldOutNow = true
        return failure('QR_LINE_UNAVAILABLE', 409)
      }),
    )
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Xác nhận yêu cầu' }))
    expect(await screen.findByText(/Có món vừa hết hàng/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Kiểm tra lại yêu cầu' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Nhận món Trà đá' })).toBeDisabled())
    expect(screen.getByRole('checkbox', { name: 'Nhận món Trà đá' })).not.toBeChecked()
  })

  it('shows the reason a line was left out on an approved request', async () => {
    const request = twoLineRequest({
      status: 'APPROVED',
      items: twoLineRequest().items.map((item) =>
        item.id === tea
          ? { ...item, rejectedAt: new Date().toISOString(), rejectionReason: 'Món đã hết, xin lỗi bạn' }
          : item,
      ),
    })
    server.use(
      http.get(base + '/qr-order-requests/:id', () =>
        HttpResponse.json(reviewDetail({ request, currentQuote: null, canApprove: false, reasonCode: null })),
      ),
    )
    mount()
    expect(await screen.findByText('Không nhận: Món đã hết, xin lỗi bạn')).toBeInTheDocument()
  })
})
