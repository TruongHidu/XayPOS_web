import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import { HttpResponse, http } from 'msw'
import { KitchenPage } from '../features/kitchen/pages/KitchenPage'
import { groupTickets, summarizeDishes, urgencyOf } from '../features/kitchen/utils/kitchenModel'
import type { KitchenItem } from '../features/kitchen/schemas'
import { canTakeawayOrders } from '../features/order/policies/orderAccessPolicy'
import { stockShortageOf } from '../features/order/utils/stockShortage'
import { OrderFeedback } from '../features/order/components/OrderUi'
import { TransferQrPanel } from '../features/payment/components/TransferQrPanel'
import { useAuthStore } from '../features/auth/store/authStore'
import { queryClient } from '../shared/api/queryClient'
import { base, failure, makeOrder, orderFixture, page } from './orderFixtures'
import { mids, renderPage, resetTenant, seedTenant } from './managementFixtures'
import { server } from './server'

afterEach(() => {
  cleanup()
  resetTenant()
})

const kitchenItem = (overrides: Partial<KitchenItem> = {}): KitchenItem => ({
  orderId: mids.order,
  orderCode: 'OD-1',
  orderVersion: 3,
  orderItemId: mids.line,
  itemName: 'Phở bò',
  quantity: 2,
  unit: 'tô',
  note: 'Không hành',
  itemStatus: 'PENDING',
  serviceType: 'DINE_IN',
  createdAt: '2026-11-16T01:00:00Z',
  sentToKitchenAt: '2026-11-16T01:01:00Z',
  sessionId: mids.session,
  tableId: mids.table,
  tableCode: 'B01',
  tableName: 'Bàn 1',
  ...overrides,
})

describe('kitchen model', () => {
  it('groups lines into tickets, oldest order first, and sums dishes', () => {
    const other = '99999999-0000-4000-8000-000000000001'
    const items = [
      kitchenItem({ orderId: other, orderCode: 'OD-2', orderItemId: other, sentToKitchenAt: '2026-11-16T01:05:00Z', serviceType: 'TAKEAWAY', tableName: null }),
      kitchenItem(),
      kitchenItem({ orderItemId: mids.recipe, itemStatus: 'COOKING', quantity: 1, orderVersion: 4 }),
    ]
    const tickets = groupTickets(items, new Map([[mids.order, 6]]))
    expect(tickets.map((t) => t.orderCode)).toEqual(['OD-1', 'OD-2'])
    expect(tickets[0].orderVersion).toBe(6)
    expect(tickets[0].items[0].itemStatus).toBe('COOKING')
    expect(tickets[1].seating).toBe('Mang đi')
    const dishes = summarizeDishes(items)
    expect(dishes).toHaveLength(1)
    expect(dishes[0]).toMatchObject({ name: 'Phở bò', pending: 4, cooking: 1 })
    expect(urgencyOf(25 * 60_000)).toBe('late')
  })
})

describe('kitchen page', () => {
  const permissions = ['KITCHEN_VIEW', 'KITCHEN_START_COOKING', 'KITCHEN_MARK_READY', 'ORDER_MARK_SERVED']
  const features = ['KITCHEN_DISPLAY', 'ORDER_MANAGEMENT']

  it('starts cooking with the order version, then marks the whole order ready with the newer version', async () => {
    seedTenant({ role: 'KITCHEN', permissions, features })
    const bodies: Array<{ path: string; body: unknown }> = []
    server.use(
      http.get(base + '/kitchen/items', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status')
        return HttpResponse.json(page(status === 'PENDING' ? [kitchenItem()] : []))
      }),
      http.post(base + '/orders/:id/items/:line/start-cooking', async ({ request }) => {
        bodies.push({ path: 'start', body: await request.json() })
        return HttpResponse.json({ ...orderFixture(), version: 4 })
      }),
      http.post(base + '/orders/:id/mark-ready', async ({ request }) => {
        bodies.push({ path: 'all-ready', body: await request.json() })
        return HttpResponse.json({ ...orderFixture(), version: 5 })
      }),
    )
    const user = userEvent.setup()
    renderPage(<KitchenPage />, { path: '/app/kitchen' })
    const ticket = await screen.findByRole('article', { name: 'Bàn 1 OD-1' })
    expect(within(ticket).getByText('Không hành')).toBeInTheDocument()
    await user.click(within(ticket).getByRole('button', { name: 'Bắt đầu nấu' }))
    await waitFor(() => expect(bodies[0]).toEqual({ path: 'start', body: { expectedOrderVersion: 3 } }))
    await user.click(within(ticket).getByRole('button', { name: 'Xong cả đơn' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xác nhận đã xong' }))
    // The queue still says version 3; the response of the first action said 4.
    await waitFor(() => expect(bodies[1]).toEqual({ path: 'all-ready', body: { expectedOrderVersion: 4 } }))
  })

  it('switches to the per-dish summary and hides actions without permissions', async () => {
    seedTenant({ role: 'WAITER', permissions: ['KITCHEN_VIEW'], features })
    server.use(
      http.get(base + '/kitchen/items', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status')
        return HttpResponse.json(page(status === 'PENDING' ? [kitchenItem()] : []))
      }),
    )
    const user = userEvent.setup()
    renderPage(<KitchenPage />, { path: '/app/kitchen' })
    const ticket = await screen.findByRole('article', { name: 'Bàn 1 OD-1' })
    expect(within(ticket).queryByRole('button')).not.toBeInTheDocument()
    expect(within(ticket).getByText(/Chờ nấu/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Theo món' }))
    expect(screen.getByText(/chờ lâu nhất/)).toBeInTheDocument()
  })
})

describe('takeaway queue policy', () => {
  it('needs POS_QUICK_ORDER and a way to move orders along', () => {
    const access = () => {
      const state = useAuthStore.getState()
      return { user: state.user, entitlement: state.entitlement, entitlementState: state.entitlementState }
    }
    seedTenant({ role: 'CASHIER', permissions: ['ORDER_VIEW', 'ORDER_UPDATE'], features: ['ORDER_MANAGEMENT', 'POS_QUICK_ORDER'] })
    expect(canTakeawayOrders(access())).toBe(true)
    seedTenant({ role: 'KITCHEN', permissions: ['ORDER_VIEW'], features: ['ORDER_MANAGEMENT', 'POS_QUICK_ORDER'] })
    expect(canTakeawayOrders(access())).toBe(false)
    seedTenant({ role: 'CASHIER', permissions: ['ORDER_VIEW', 'ORDER_UPDATE'], features: ['ORDER_MANAGEMENT'] })
    expect(canTakeawayOrders(access())).toBe(false)
  })
})

describe('stock shortage details', () => {
  const shortage = (details: unknown) =>
    new AxiosError('conflict', 'ERR', undefined, undefined, {
      status: 409,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { success: false, code: 'INSUFFICIENT_AVAILABLE_STOCK', message: 'x', fieldErrors: {}, timestamp: '', details },
    })

  it('folds lines by dish and says how many can still be made', () => {
    const error = shortage({
      lines: [
        { orderItemId: 'a', menuItemId: 'pho', itemName: 'Phở bò', requestedQuantity: 2, maxAvailableQuantity: 1, unit: 'tô', sharesIngredientWithOtherLines: false, shortIngredients: [{ ingredientId: 'beef', name: 'Thịt bò', unit: 'g', availableQuantity: 500, requiredQuantity: 1260 }] },
        { orderItemId: 'b', menuItemId: 'pho', itemName: 'Phở bò', requestedQuantity: 1, maxAvailableQuantity: 0, unit: 'tô', sharesIngredientWithOtherLines: false },
        { orderItemId: 'c', menuItemId: 'coca', itemName: 'Coca', requestedQuantity: 3, maxAvailableQuantity: 0, unit: 'lon', sharesIngredientWithOtherLines: false },
      ],
    })
    expect(stockShortageOf(error)).toEqual([
      expect.objectContaining({ name: 'Phở bò', requested: 3, verdict: 'reduce', canMake: 2 }),
      expect.objectContaining({ name: 'Coca', requested: 3, verdict: 'soldOut' }),
    ])
    render(<OrderFeedback error={error} />)
    expect(screen.getByText(/làm được tối đa 2 tô \(bớt 1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Thịt bò: còn 500 g, cần 1.260 g/)).toBeInTheDocument()
    expect(screen.getByText(/bỏ món này khỏi đơn/)).toBeInTheDocument()
  })

  it('falls back to the plain message without details', () => {
    expect(stockShortageOf(shortage(undefined))).toBeNull()
  })
})

describe('transfer QR panel', () => {
  const renderPanel = () => {
    const order = makeOrder({ totalAmount: 100000, paidAmount: 0 })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TransferQrPanel order={order} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    return order
  }

  it('shows the VietQR with bank details and warns when the amount differs', async () => {
    seedTenant({ permissions: ['PAYMENT_CREATE'], features: ['PAYMENT_MANAGEMENT'] })
    const order = makeOrder({ totalAmount: 100000, paidAmount: 0 })
    server.use(
      http.get(base + '/orders/:id/transfer-qr', () =>
        HttpResponse.json({
          orderId: order.id,
          orderVersion: order.version,
          amount: 90000,
          currencyCode: 'VND',
          bankBin: '970436',
          accountNumber: '0123456789',
          accountName: 'NGUYEN VAN A',
          transferContent: 'OD1 THANH TOAN',
          qrPayload: '000201010212',
        }),
      ),
    )
    renderPanel()
    expect(await screen.findByText('Vietcombank')).toBeInTheDocument()
    expect(screen.getByText('OD1 THANH TOAN')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Số tiền trong mã QR khác số cần thu')
  })

  it('explains when no receiving account is configured', async () => {
    seedTenant({ permissions: ['PAYMENT_CREATE'], features: ['PAYMENT_MANAGEMENT'] })
    server.use(http.get(base + '/orders/:id/transfer-qr', () => failure('TRANSFER_ACCOUNT_NOT_CONFIGURED')))
    renderPanel()
    expect(await screen.findByText(/chưa cài tài khoản nhận chuyển khoản/)).toBeInTheDocument()
  })
})
