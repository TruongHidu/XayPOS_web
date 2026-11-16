import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { DailyRevenuePage } from '../features/reports/pages/DailyRevenuePage'
import { ReportsPage } from '../features/reports/pages/ReportsPage'
import { ReferenceMarginPage } from '../features/reports/pages/ReferenceMarginPage'
import { OverviewPage } from '../features/reports/pages/OverviewPage'
import { canDailyReport, canDetailReport, canReferenceMargin } from '../features/reports/policies/reportAccessPolicy'
import { homePathFor } from '../portals/app/sections'
import { useAuthStore } from '../features/auth/store/authStore'
import { toIsoDate } from '../shared/ui/dateRange'
import { base, page } from './orderFixtures'
import { renderPage, resetTenant, seedTenant } from './managementFixtures'
import { server } from './server'

afterEach(() => {
  cleanup()
  resetTenant()
})

const access = () => {
  const state = useAuthStore.getState()
  return { user: state.user, entitlement: state.entitlement, entitlementState: state.entitlementState }
}

const meta = (overrides: Record<string, unknown> = {}) => ({
  fromDate: '2026-11-10',
  toDate: '2026-11-16',
  timezone: 'Asia/Ho_Chi_Minh',
  currencyCode: 'VND',
  generatedAt: '2026-11-16T05:00:00Z',
  serviceType: null,
  sourceChannel: null,
  granularity: null,
  dateBasis: null,
  ...overrides,
})
const overview = {
  collections: { collectedAmount: 1500000, successfulPaymentCount: 11, paidOrderCount: 10 },
  orders: {
    createdOrderCount: 12,
    completedOrderCount: 10,
    cancelledOrderCount: 1,
    completedSubtotalAmount: 1450000,
    completedDiscountAmount: 50000,
    completedTaxAmount: 0,
    completedServiceChargeAmount: 0,
    completedOrderSalesAmount: 1400000,
    averageCompletedOrderValue: 140000,
  },
}
const reportPage = <T,>(content: T[]) => ({ meta: meta(), data: page(content) })

describe('report access', () => {
  it('follows permission × feature, not roles', () => {
    seedTenant({ role: 'CASHIER', permissions: ['REPORT_DAILY_VIEW', 'REPORT_DETAIL_VIEW'], features: ['DAILY_REVENUE', 'DETAIL_REPORT'] })
    expect(canDailyReport(access())).toBe(true)
    expect(canDetailReport(access())).toBe(true)
    expect(canReferenceMargin(access())).toBe(false) // needs ORDER_VIEW + ORDER_MANAGEMENT too
    seedTenant({ permissions: ['REPORT_DAILY_VIEW'], features: ['DETAIL_REPORT'] })
    expect(canDailyReport(access())).toBe(false)
  })

  it('lands owners with the daily report on Tổng quan', () => {
    seedTenant({ permissions: ['REPORT_DAILY_VIEW', 'ORDER_VIEW'], features: ['DAILY_REVENUE', 'ORDER_MANAGEMENT'] })
    expect(homePathFor(access())).toBe('/app/overview')
  })
})

describe('daily revenue', () => {
  it('shows takings and completed sales separately and moves between days', async () => {
    seedTenant({ permissions: ['REPORT_DAILY_VIEW'], features: ['DAILY_REVENUE'] })
    const dates: Array<string | null> = []
    server.use(
      http.get(base + '/reports/daily', ({ request }) => {
        dates.push(new URL(request.url).searchParams.get('date'))
        return HttpResponse.json({ meta: meta({ fromDate: '2026-11-16', toDate: '2026-11-16' }), data: overview })
      }),
    )
    const user = userEvent.setup()
    renderPage(<DailyRevenuePage />, { path: '/app/daily-revenue' })
    expect(await screen.findByText(/1\.500\.000/)).toBeInTheDocument()
    expect(screen.getByText('Tiền đã thu')).toBeInTheDocument()
    expect(screen.getByText('Cấu thành doanh số đơn hoàn tất')).toBeInTheDocument()
    expect(screen.getByText('11 giao dịch · 10 đơn có thu tiền')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ngày trước' }))
    const today = new Date()
    const yesterday = toIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))
    await waitFor(() => expect(dates).toContain(yesterday))
    expect(screen.getByRole('button', { name: 'Hôm nay' })).toBeInTheDocument()
  })
})

describe('reports page', () => {
  it('loads summary, series and payment methods with the range filters, and the reconciliation tab', async () => {
    seedTenant({ permissions: ['REPORT_DETAIL_VIEW'], features: ['DETAIL_REPORT'] })
    const calls: Record<string, URLSearchParams> = {}
    const record = (name: string, url: string) => (calls[name] = new URL(url).searchParams)
    server.use(
      http.get(base + '/reports/summary', ({ request }) => {
        record('summary', request.url)
        return HttpResponse.json({ meta: meta(), data: overview })
      }),
      http.get(base + '/reports/revenue-series', ({ request }) => {
        record('series', request.url)
        return HttpResponse.json({ meta: meta({ granularity: 'DAY' }), data: [{ bucketStartDate: '2026-11-15', collectedAmount: 100000, completedOrderSalesAmount: 80000, successfulPaymentCount: 2, completedOrderCount: 1 }] })
      }),
      http.get(base + '/reports/payment-methods', () =>
        HttpResponse.json({
          meta: meta(),
          data: [
            { paymentMethod: 'CASH', collectedAmount: 600000, successfulPaymentCount: 6, percentage: 60 },
            { paymentMethod: 'TRANSFER', collectedAmount: 400000, successfulPaymentCount: 4, percentage: 40 },
          ],
        }),
      ),
      http.get(base + '/reports/orders', ({ request }) => {
        record('orders', request.url)
        return HttpResponse.json(
          reportPage([
            {
              id: '33333333-3333-4333-8333-333333333333',
              orderCode: 'OD-9',
              serviceType: 'TAKEAWAY',
              sourceChannel: 'QR_STATIC',
              status: 'COMPLETED',
              paymentStatus: 'PAID',
              currencyCode: 'VND',
              totalAmount: 90000,
              collectedAmountInRange: 90000,
              createdAt: '2026-11-15T03:00:00Z',
              completedAt: '2026-11-15T03:30:00Z',
              cancelledAt: null,
              reportEventAt: '2026-11-15T03:20:00Z',
            },
          ]),
        )
      }),
    )
    const user = userEvent.setup()
    renderPage(<ReportsPage />, { path: '/app/reports', entry: '/app/reports?from=2026-11-10&to=2026-11-16&serviceType=TAKEAWAY' })
    expect(await screen.findByText('Chuyển khoản')).toBeInTheDocument()
    expect(calls.summary.get('fromDate')).toBe('2026-11-10')
    expect(calls.summary.get('serviceType')).toBe('TAKEAWAY')
    await waitFor(() => expect(calls.series?.get('granularity')).toBe('DAY'))

    await user.click(screen.getByRole('tab', { name: 'Đối soát đơn' }))
    expect(await screen.findByText('OD-9')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Lọc theo'), 'PAID')
    await waitFor(() => expect(calls.orders.get('dateBasis')).toBe('PAID'))
    expect(await screen.findByRole('columnheader', { name: 'Thu trong kỳ' })).toBeInTheDocument()
  })

  it('blocks ranges longer than 366 days before calling the server', async () => {
    seedTenant({ permissions: ['REPORT_DETAIL_VIEW'], features: ['DETAIL_REPORT'] })
    renderPage(<ReportsPage />, { path: '/app/reports', entry: '/app/reports?from=2024-01-01&to=2026-11-16' })
    expect(await screen.findByText('Tối đa 366 ngày.')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })
})

describe('reference margin', () => {
  it('keeps uncovered orders out of the margin and shows why', async () => {
    seedTenant({ permissions: ['REPORT_DETAIL_VIEW', 'ORDER_VIEW'], features: ['DETAIL_REPORT', 'ORDER_MANAGEMENT'] })
    const summary = {
      costBasis: 'CATALOG_REFERENCE_AT_ACCEPTANCE',
      marginScope: 'FULLY_COSTED_COMPLETED_ORDERS',
      costCoverageStatus: 'PARTIAL',
      completedOrderCount: 10,
      fullyCostedOrderCount: 8,
      excludedOrderCount: 2,
      orderCoveragePercent: 80,
      subtotalAmount: 1050000,
      discountAmount: 50000,
      taxAmount: 0,
      serviceChargeAmount: 0,
      salesAmount: 1000000,
      netSalesAmount: 1000000,
      coveredNetSalesAmount: 800000,
      coveredReferenceCostAmount: 300000,
      coveredReferenceMarginAmount: 500000,
      coveredReferenceMarginPercent: 62.5,
      costIssues: [{ code: 'INCOMPLETE', orderCount: 2, itemCount: 2 }],
    }
    server.use(
      http.get(base + '/reports/reference-margin/summary', () => HttpResponse.json({ meta: meta({ dateBasis: 'COMPLETED' }), data: summary })),
      http.get(base + '/reports/reference-margin/series', () => HttpResponse.json({ meta: meta(), data: [] })),
      http.get(base + '/reports/reference-margin/orders', () =>
        HttpResponse.json(
          reportPage([
            {
              orderId: '33333333-3333-4333-8333-333333333333',
              orderCode: 'OD-7',
              completedAt: '2026-11-15T03:30:00Z',
              serviceType: 'DINE_IN',
              sourceChannel: 'WAITER',
              subtotalAmount: 100000,
              discountAmount: 0,
              taxAmount: 0,
              serviceChargeAmount: 0,
              salesAmount: 100000,
              netSalesAmount: 100000,
              eligibleItemCount: 2,
              fullyCostedItemCount: 1,
              costCoverageStatus: 'PARTIAL',
              costIssues: [{ code: 'INCOMPLETE', orderCount: 1, itemCount: 1 }],
              referenceCostAmount: null,
              referenceMarginAmount: null,
              referenceMarginPercent: null,
            },
          ]),
        ),
      ),
    )
    renderPage(<ReferenceMarginPage />, { path: '/app/reference-margin' })
    expect(await screen.findByText('Thiếu một phần')).toBeInTheDocument()
    expect(screen.getByText(/2 \/ 10 đơn bị loại khỏi lãi gộp/)).toBeInTheDocument()
    expect(screen.getByText('Tỷ lệ 62,5%')).toBeInTheDocument()
    const row = (await screen.findByText('OD-7')).closest('tr')!
    // Missing cost is unknown, never shown as 0.
    expect(within(row).getByText('Chưa đủ')).toBeInTheDocument()
    expect(within(row).getByText(/Thiếu một phần \(1\/2\)/)).toBeInTheDocument()
  })
})

describe('overview', () => {
  it('shows today and only the live cards the user may open', async () => {
    seedTenant({ permissions: ['REPORT_DAILY_VIEW', 'TABLE_VIEW'], features: ['DAILY_REVENUE', 'TABLE_MANAGEMENT'] })
    server.use(
      http.get(base + '/reports/daily', () => HttpResponse.json({ meta: meta(), data: overview })),
      http.get(base + '/tables', () => HttpResponse.json({ ...page([]), totalElements: 4 })),
    )
    renderPage(<OverviewPage />, { path: '/app/overview' })
    expect(await screen.findByText(/1\.400\.000/)).toBeInTheDocument()
    expect(await screen.findByText('Bàn đang phục vụ')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /Bàn đang phục vụ/ })).toHaveTextContent('4'))
    expect(screen.queryByText('Món chờ bếp nấu')).not.toBeInTheDocument()
    expect(screen.queryByText('Yêu cầu QR chờ duyệt')).not.toBeInTheDocument()
  })
})
