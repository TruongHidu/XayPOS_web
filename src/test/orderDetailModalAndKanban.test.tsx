import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import { queryClient } from '../shared/api/queryClient'
import { OrderListPage } from '../features/order/pages/OrderListPage'
import { OrderDetailModal } from '../features/order/components/OrderDetailModal'
import {
  seedOrderAccess,
  resetOrderTest,
  orderFixture,
  orderHandlers,
  base,
  ids,
  makeOrder,
  page,
} from './orderFixtures'

describe('OrderDetailModal and Kanban Flow Integration Tests', () => {
  beforeEach(() => {
    seedOrderAccess(
      [
        'ORDER_VIEW',
        'ORDER_CREATE',
        'ORDER_UPDATE',
        'ORDER_CANCEL',
        'ORDER_MARK_SERVED',
        'ORDER_COMPLETE',
        'TABLE_VIEW',
        'TABLE_CLOSE',
        'PAYMENT_CREATE',
        'PAYMENT_CONFIRM',
        'PAYMENT_VIEW',
      ],
      ['ORDER_MANAGEMENT', 'TABLE_MANAGEMENT', 'PAYMENT_MANAGEMENT'],
    )
    server.use(...orderHandlers)
  })

  afterEach(resetOrderTest)

  it('renders OrderDetailModal with items, pay button for unpaid order, calls markAllServed on click, and displays complete button when paid and served', async () => {
    const user = userEvent.setup()
    let markServedCalled = false
    let completeCalled = false

    const orderInitial = makeOrder({
      id: ids.order,
      orderCode: 'KT-TEST-001',
      status: 'CONFIRMED',
      paymentStatus: 'UNPAID',
      paidAmount: 0,
      totalAmount: 50000,
      version: 1,
      items: [
        {
          ...orderFixture().items[0],
          id: ids.line,
          itemName: 'Trà Đào Cam Sả',
          quantity: 2,
          unitPrice: 25000,
          lineTotal: 50000,
          status: 'COOKING',
        },
      ],
    })

    server.use(
      http.get(base + '/orders/' + ids.order, () => {
        return HttpResponse.json(orderInitial)
      }),
      http.post(base + '/orders/' + ids.order + '/mark-served', async () => {
        markServedCalled = true
        // Return updated order that is now SERVED and PAID
        return HttpResponse.json({
          ...orderInitial,
          status: 'SERVED',
          paymentStatus: 'PAID',
          paidAmount: 50000,
          version: 2,
          items: [{ ...orderInitial.items[0], status: 'SERVED' }],
        })
      }),
      http.post(base + '/orders/' + ids.order + '/complete', async () => {
        completeCalled = true
        return HttpResponse.json({
          ...orderInitial,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          paidAmount: 50000,
          version: 3,
        })
      }),
    )

    const onOpenPay = vi.fn()
    const onClose = vi.fn()

    render(
      <QueryClientProvider client={queryClient}>
        <OrderDetailModal
          orderId={ids.order}
          onClose={onClose}
          onOpenPay={onOpenPay}
        />
      </QueryClientProvider>,
    )

    // 1. Wait for modal data to load
    expect(await screen.findByText('Trà Đào Cam Sả')).toBeInTheDocument()
    expect(screen.getByText('Đang nấu')).toBeInTheDocument()

    // 2. Unpaid order displays payment button
    const payBtn = screen.getByRole('button', { name: /Thanh toán 50\.000/ })
    expect(payBtn).toBeInTheDocument()
    await user.click(payBtn)
    expect(onOpenPay).toHaveBeenCalledWith(ids.order)

    // 3. Mark all served button calls markAllServed API
    const markServedBtn = screen.getByRole('button', { name: /Đã lên món/ })
    expect(markServedBtn).toBeInTheDocument()
    await user.click(markServedBtn)
    expect(markServedCalled).toBe(true)

    // 4. Once served and paid, the Complete button appears
    const completeBtn = await screen.findByRole('button', { name: /Hoàn thành/ })
    expect(completeBtn).toBeInTheDocument()
    await user.click(completeBtn)
    expect(completeCalled).toBe(true)
  })

  it('OrderListPage puts CONFIRMED order into cooking column and provides mark served, pay, and complete actions', async () => {
    const user = userEvent.setup()
    let markServedCalled = false

    const confirmedOrder = {
      id: ids.order,
      orderCode: 'OD-CONFIRMED',
      serviceType: 'TAKEAWAY' as const,
      sourceChannel: 'CASHIER' as const,
      tableSessionId: null,
      status: 'CONFIRMED' as const,
      paymentStatus: 'UNPAID' as const,
      customerName: 'Khách VIP',
      guestCount: 1,
      currencyCode: 'VND',
      totalAmount: 100000,
      paidAmount: 0,
      createdAt: '2026-10-08T00:00:00Z',
      updatedAt: '2026-10-08T00:00:00Z',
      version: 1,
    }

    server.use(
      http.get(base + '/orders', ({ request }) => {
        const url = new URL(request.url)
        const status = url.searchParams.get('status')
        if (status === 'CONFIRMED') {
          return HttpResponse.json(page([confirmedOrder]))
        }
        return HttpResponse.json(page([]))
      }),
      http.post(base + '/orders/' + ids.order + '/mark-served', async () => {
        markServedCalled = true
        return HttpResponse.json({
          ...orderFixture(),
          status: 'SERVED',
        })
      }),
    )

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/cashier/orders']}>
          <Routes>
            <Route path="/cashier/orders" element={<OrderListPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    // Wait for the CONFIRMED order to appear on screen
    await screen.findByText('OD-CONFIRMED')

    // Cooking column (aria-label "Đang chế biến") must contain the CONFIRMED order
    const cookingCol = screen.getByRole('region', { name: 'Đang chế biến' })
    expect(cookingCol).toBeInTheDocument()
    expect(cookingCol).toHaveTextContent('OD-CONFIRMED')
    expect(cookingCol).toHaveTextContent('Đang nấu')

    // It has "Đã lên món" button inside cooking column
    const servedBtn = within(cookingCol).getByRole('button', { name: /Đã lên món/ })
    expect(servedBtn).toBeInTheDocument()

    // It has "Thanh toán" button for unpaid order
    const payBtn = within(cookingCol).getByRole('button', { name: /(Thu tiền|Thanh toán)/ })
    expect(payBtn).toBeInTheDocument()

    // Click "Đã lên món" invokes markAllServed
    await user.click(servedBtn)
    expect(markServedCalled).toBe(true)
  })

  it('puts READY orders (mon da san sang) into cooking column, keeping only SERVED in ready column', async () => {
    const readyOrder = {
      id: '44444444-4444-4444-8444-444444444444',
      orderCode: 'OD-READY-ORDER',
      serviceType: 'TAKEAWAY' as const,
      sourceChannel: 'CASHIER' as const,
      tableSessionId: null,
      status: 'READY' as const,
      paymentStatus: 'UNPAID' as const,
      customerName: 'Khách Đã Xong Bếp',
      guestCount: 1,
      currencyCode: 'VND',
      totalAmount: 40000,
      paidAmount: 0,
      createdAt: '2026-10-08T00:00:00Z',
      updatedAt: '2026-10-08T00:00:00Z',
      version: 1,
    }

    const servedOrder = {
      id: '55555555-5555-5555-8555-555555555555',
      orderCode: 'OD-SERVED-ORDER',
      serviceType: 'TAKEAWAY' as const,
      sourceChannel: 'CASHIER' as const,
      tableSessionId: null,
      status: 'SERVED' as const,
      paymentStatus: 'UNPAID' as const,
      customerName: 'Khách Đã Nhận Món',
      guestCount: 1,
      currencyCode: 'VND',
      totalAmount: 60000,
      paidAmount: 0,
      createdAt: '2026-10-08T00:00:00Z',
      updatedAt: '2026-10-08T00:00:00Z',
      version: 1,
    }

    server.use(
      http.get(base + '/orders', ({ request }) => {
        const url = new URL(request.url)
        const status = url.searchParams.get('status')
        if (status === 'READY') {
          return HttpResponse.json(page([readyOrder]))
        }
        if (status === 'SERVED') {
          return HttpResponse.json(page([servedOrder]))
        }
        return HttpResponse.json(page([]))
      }),
    )

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/cashier/orders']}>
          <Routes>
            <Route path="/cashier/orders" element={<OrderListPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    // Wait for orders to render
    await screen.findByText('OD-READY-ORDER')
    await screen.findByText('OD-SERVED-ORDER')

    // READY order is still in cooking column ("Đang chế biến")
    const cookingCol = screen.getByRole('region', { name: 'Đang chế biến' })
    expect(cookingCol).toHaveTextContent('OD-READY-ORDER')
    expect(within(cookingCol).getByRole('button', { name: /Đã lên món/ })).toBeInTheDocument()
    expect(within(cookingCol).getByRole('button', { name: /(Thu tiền|Thanh toán)/ })).toBeInTheDocument()

    // SERVED order is in ready column ("Sẵn sàng / Đã giao") with payment button
    const readyCol = screen.getByRole('region', { name: 'Sẵn sàng / Đã giao' })
    expect(readyCol).toHaveTextContent('OD-SERVED-ORDER')
    expect(within(readyCol).getByRole('button', { name: /(Thu tiền|Thanh toán)/ })).toBeInTheDocument()
  })
})
