import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { CashbookPage } from '../features/cashbook/pages/CashbookPage'
import { canCreateExpense, canLinkStockReceipt, canReconcileReceipts, canViewCashbook, canVoidExpense } from '../features/cashbook/policies/cashbookAccessPolicy'
import { visibleSections } from '../portals/app/sections'
import { useAuthStore } from '../features/auth/store/authStore'
import { base, failure, page } from './orderFixtures'
import { dates, renderPage, resetTenant, seedTenant } from './managementFixtures'
import { server } from './server'

afterEach(() => {
  cleanup()
  resetTenant()
})

const E = '11000000-0000-4000-8000-000000000001'
const P = '12000000-0000-4000-8000-000000000001'
const D = '13000000-0000-4000-8000-000000000001'
const W = '14000000-0000-4000-8000-000000000001'

const access = () => {
  const s = useAuthStore.getState()
  return { user: s.user, entitlement: s.entitlement, entitlementState: s.entitlementState }
}
const cashbookPermissions = ['CASHBOOK_VIEW', 'CASHBOOK_CREATE', 'CASHBOOK_VOID']
const seedCashbook = (extra: { permissions?: string[]; features?: string[] } = {}) =>
  seedTenant({
    role: 'CASHIER',
    permissions: [...cashbookPermissions, 'ORDER_VIEW', 'INVENTORY_VIEW', ...(extra.permissions ?? [])],
    features: extra.features ?? ['DETAIL_REPORT', 'ORDER_MANAGEMENT', 'INVENTORY_MANAGEMENT'],
  })

const meta = { fromDate: '2026-11-01', toDate: '2026-11-18', timezone: 'Asia/Ho_Chi_Minh', currencyCode: 'VND', dateBasis: 'CASH_OCCURRED_AT', granularity: null, generatedAt: dates.createdAt }
const categories = [
  { id: null, code: 'INGREDIENT_PURCHASE', name: 'Mua nguyên liệu', type: 'EXPENSE', active: true },
  { id: null, code: 'RENT', name: 'Thuê mặt bằng', type: 'EXPENSE', active: true },
  { id: null, code: 'OTHER', name: 'Chi khác', type: 'EXPENSE', active: false },
]
const summary = {
  totalIncomeAmount: 5_000_000,
  totalExpenseAmount: 1_200_000,
  netCashFlowAmount: 3_800_000,
  incomeEntryCount: 12,
  expenseEntryCount: 2,
  saleIncomeAmount: 5_000_000,
  receiptLinkedExpenseAmount: 700_000,
  otherExpenseAmount: 500_000,
}
const seriesPoint = { bucketStartDate: '2026-11-01', totalIncomeAmount: 5_000_000, totalExpenseAmount: 1_200_000, netCashFlowAmount: 3_800_000, incomeEntryCount: 12, expenseEntryCount: 2 }
const entry = (overrides: Record<string, unknown> = {}) => ({
  sourceType: 'ORDER_PAYMENT',
  sourceId: P,
  code: 'PAY-1',
  type: 'INCOME',
  categoryCode: 'SALES_COLLECTION',
  categoryName: 'Thu bán hàng',
  amount: 250_000,
  currencyCode: 'VND',
  paymentMethod: 'CASH',
  occurredAt: '2026-11-10T03:00:00Z',
  recordedAt: '2026-11-10T03:00:00Z',
  createdBy: null,
  orderId: P,
  orderCode: 'DH-1',
  stockDocumentId: null,
  sourceDocumentCode: null,
  ...overrides,
})
const expense = (overrides: Record<string, unknown> = {}) => ({
  id: E,
  expenseCode: 'PC-1',
  categoryCode: 'RENT',
  categoryName: 'Thuê mặt bằng',
  amount: 500_000,
  currencyCode: 'VND',
  paymentMethod: 'CASH',
  expenseAt: '2026-11-10T03:00:00Z',
  stockDocumentId: null,
  sourceDocumentCode: null,
  sourceCurrencyStatus: null,
  referenceNo: null,
  payeeName: 'Chủ nhà',
  note: null,
  status: 'POSTED',
  createdBy: 'u',
  createdAt: '2026-11-11T03:00:00Z',
  updatedAt: '2026-11-11T03:00:00Z',
  version: 3,
  voidedBy: null,
  voidedAt: null,
  voidReason: null,
  ...overrides,
})
const receipt = (overrides: Record<string, unknown> = {}) => ({
  stockDocumentId: D,
  documentCode: 'PN-7',
  warehouseId: W,
  warehouseName: 'Kho chính',
  confirmedAt: '2026-11-09T03:00:00Z',
  totalCost: 700_000,
  currencyCode: 'VND',
  currencyStatus: 'KNOWN',
  linkedPostedExpenseCount: 0,
  recordedExpenseAmountAllTime: 0,
  ...overrides,
})

/** Read endpoints of the cashbook; `seen` records each request's query string. */
function cashbookReads(seen: Record<string, URLSearchParams[]> = {}, entries = [entry()]) {
  const record = (name: string, request: Request) => (seen[name] ??= []).push(new URL(request.url).searchParams)
  return [
    http.get(base + '/cashbook/categories', () => HttpResponse.json(categories)),
    http.get(base + '/cashbook/summary', ({ request }) => (record('summary', request), HttpResponse.json({ meta, data: summary }))),
    http.get(base + '/cashbook/series', ({ request }) => (record('series', request), HttpResponse.json({ meta, data: [seriesPoint] }))),
    http.get(base + '/cashbook/entries', ({ request }) => (record('entries', request), HttpResponse.json({ meta, data: page(entries) }))),
    http.get(base + '/cashbook/expenses', () => HttpResponse.json({ meta, data: page([expense()]) })),
    http.get(base + '/cashbook/stock-receipts', () => HttpResponse.json({ meta, data: page([receipt(), receipt({ stockDocumentId: '13000000-0000-4000-8000-000000000002', documentCode: 'PN-OLD', currencyStatus: 'UNKNOWN', currencyCode: null, recordedExpenseAmountAllTime: null })]) })),
    http.get(base + '/inventory/warehouses', () => HttpResponse.json(page([{ id: W, code: 'KHO', name: 'Kho chính', isDefault: true, active: true, version: 0, ...dates }]))),
  ]
}

const RANGE = 'from=2026-11-01&to=2026-11-18'
const open = (query = '') => renderPage(<CashbookPage />, { path: '/app/cashbook', entry: `/app/cashbook?${RANGE}${query}` })

describe('cashbook policy', () => {
  it('follows permission × DETAIL_REPORT, without excluding cashiers', () => {
    seedCashbook()
    expect(canViewCashbook(access())).toBe(true)
    expect(canCreateExpense(access())).toBe(true)
    expect(canVoidExpense(access())).toBe(true)
    expect(canLinkStockReceipt(access())).toBe(true)
    expect(canReconcileReceipts(access())).toBe(true)
    expect(visibleSections(access()).map((s) => s.id)).toContain('cashbook')

    seedCashbook({ features: ['ORDER_MANAGEMENT', 'INVENTORY_MANAGEMENT'] })
    expect(canViewCashbook(access())).toBe(false)
    expect(visibleSections(access()).map((s) => s.id)).not.toContain('cashbook')

    // Without the inventory package: cashbook works, receipt link and reconciliation do not.
    seedCashbook({ features: ['DETAIL_REPORT'] })
    expect(canCreateExpense(access())).toBe(true)
    expect(canLinkStockReceipt(access())).toBe(false)
    expect(canReconcileReceipts(access())).toBe(false)

    seedTenant({ role: 'OWNER', permissions: ['CASHBOOK_CREATE'], features: ['DETAIL_REPORT'] })
    expect(canCreateExpense(access())).toBe(false)
  })
})

describe('Dòng tiền', () => {
  it('loads summary, series and entries with the same period and filters, keyed by source', async () => {
    seedCashbook()
    const seen: Record<string, URLSearchParams[]> = {}
    // Same sourceId, different sourceType: both rows must render.
    server.use(...cashbookReads(seen, [entry(), entry({ sourceType: 'EXPENSE_VOUCHER', code: 'PC-9', type: 'EXPENSE', categoryName: 'Thuê mặt bằng', orderId: null, orderCode: null })]))
    open('&type=EXPENSE&paymentMethod=CASH')
    expect(await screen.findByText('Chênh lệch thu chi')).toBeInTheDocument()
    expect(screen.getByText(/không phải lợi nhuận hay số dư quỹ/)).toBeInTheDocument()
    expect(await screen.findByText('PAY-1')).toBeInTheDocument()
    expect(screen.getByText('PC-9')).toBeInTheDocument()
    await waitFor(() => expect(seen.entries?.length).toBeGreaterThan(0))
    for (const name of ['summary', 'series', 'entries']) {
      const params = seen[name][0]
      expect(params.get('fromDate')).toBe('2026-11-01')
      expect(params.get('toDate')).toBe('2026-11-18')
      expect(params.get('type')).toBe('EXPENSE')
      expect(params.get('paymentMethod')).toBe('CASH')
    }
    expect(seen.series[0].get('granularity')).toBe('DAY')
    expect(screen.getByText(/Chi nhập hàng \(có phiếu nhập\)/)).toBeInTheDocument()
  })
})

describe('Ghi nhận khoản chi', () => {
  it('reuses the idempotency key on retry and sends the expected body', async () => {
    seedCashbook()
    const keys: string[] = []
    const bodies: unknown[] = []
    server.use(
      ...cashbookReads(),
      http.post(base + '/cashbook/expenses', async ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '')
        bodies.push(await request.json())
        if (keys.length === 1) return failure('INTERNAL_ERROR', 503)
        return HttpResponse.json(expense(), { status: 201, headers: { 'Idempotency-Replayed': 'false' } })
      }),
    )
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: /Ghi nhận chi/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Ghi nhận khoản chi' })
    await waitFor(() => expect(within(drawer).getByRole('option', { name: 'Thuê mặt bằng' })).toBeInTheDocument())
    // Inactive categories are not offered.
    expect(within(drawer).queryByRole('option', { name: 'Chi khác' })).toBeNull()
    await user.selectOptions(within(drawer).getByLabelText(/Danh mục chi/), 'RENT')
    await user.type(within(drawer).getByLabelText(/Số tiền đã chi/), '500000')
    await user.selectOptions(within(drawer).getByLabelText(/Phương thức/), 'TRANSFER')
    await user.type(within(drawer).getByLabelText(/Người nhận/), 'Chủ nhà')
    await user.click(within(drawer).getByRole('button', { name: 'Ghi nhận chi' }))
    expect(await within(drawer).findByText(/Chưa rõ khoản chi đã được ghi nhận hay chưa/)).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: 'Ghi nhận chi' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ghi nhận khoản chi' })).toBeNull())
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
    expect(bodies[0]).toMatchObject({ categoryCode: 'RENT', amount: 500000, paymentMethod: 'TRANSFER', payeeName: 'Chủ nhà' })
    expect((bodies[0] as { expenseAt: string }).expenseAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
    expect(bodies[0]).not.toHaveProperty('stockDocumentId')
  })

  it('says so when a replay returns an already voided expense', async () => {
    seedCashbook()
    server.use(
      ...cashbookReads(),
      http.post(base + '/cashbook/expenses', () => HttpResponse.json(expense({ status: 'VOIDED' }), { status: 200, headers: { 'Idempotency-Replayed': 'true' } })),
    )
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: /Ghi nhận chi/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Ghi nhận khoản chi' })
    await waitFor(() => expect(within(drawer).getByRole('option', { name: 'Thuê mặt bằng' })).toBeInTheDocument())
    await user.selectOptions(within(drawer).getByLabelText(/Danh mục chi/), 'RENT')
    await user.type(within(drawer).getByLabelText(/Số tiền đã chi/), '500000')
    await user.click(within(drawer).getByRole('button', { name: 'Ghi nhận chi' }))
    expect(await within(drawer).findByText(/đã được ghi nhận trước đó \(PC-1\) và đã bị hủy/)).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Ghi nhận chi' })).toBeDisabled()
  })

  it('links a stock receipt: forces the ingredient category and only suggests its value', async () => {
    seedCashbook()
    const bodies: unknown[] = []
    server.use(
      ...cashbookReads(),
      http.post(base + '/cashbook/expenses', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(expense({ categoryCode: 'INGREDIENT_PURCHASE', stockDocumentId: D }), { status: 201 })
      }),
    )
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: /Ghi nhận chi/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Ghi nhận khoản chi' })
    await user.click(within(drawer).getByRole('button', { name: /Chọn phiếu nhập/ }))
    const picker = await screen.findByRole('dialog', { name: 'Chọn phiếu nhập kho' })
    await user.click(await within(picker).findByRole('button', { name: /PN-7/ }))
    expect(within(drawer).getByText('Phiếu nhập PN-7')).toBeInTheDocument()
    await waitFor(() => expect(within(drawer).getByLabelText(/Danh mục chi/)).toHaveValue('INGREDIENT_PURCHASE'))
    expect(within(drawer).getByLabelText(/Danh mục chi/)).toBeDisabled()
    // The value is not used until the user asks for it.
    expect(within(drawer).getByLabelText(/Số tiền đã chi/)).toHaveValue('')
    await user.click(within(drawer).getByRole('button', { name: 'Dùng giá trị phiếu làm số tiền' }))
    await user.click(within(drawer).getByRole('button', { name: 'Ghi nhận chi' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ categoryCode: 'INGREDIENT_PURCHASE', amount: 700000, stockDocumentId: D })
  })
})

describe('Phiếu chi', () => {
  it('voids with the current version and a required reason', async () => {
    seedCashbook()
    const voids: unknown[] = []
    const voided = expense({ status: 'VOIDED', version: 4, voidReason: 'Ghi trùng', voidedAt: dates.updatedAt })
    server.use(
      ...cashbookReads(),
      http.get(base + '/cashbook/expenses/:id', () => HttpResponse.json(voids.length ? voided : expense())),
      http.post(base + '/cashbook/expenses/:id/void', async ({ request }) => {
        voids.push(await request.json())
        return HttpResponse.json(voided)
      }),
    )
    const user = userEvent.setup()
    open('&tab=expenses')
    await user.click(await screen.findByText('PC-1'))
    const drawer = await screen.findByRole('dialog', { name: 'Phiếu chi PC-1' })
    expect(within(drawer).getByText('Ngày đã chi tiền')).toBeInTheDocument()
    expect(within(drawer).getByText('Ngày ghi sổ')).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: 'Hủy phiếu ghi nhầm' }))
    const confirm = await screen.findByRole('dialog', { name: /Hủy phiếu chi PC-1/ })
    expect(within(confirm).getByText(/không hoàn tiền/)).toBeInTheDocument()
    expect(within(confirm).getByRole('button', { name: 'Hủy phiếu' })).toBeDisabled()
    await user.type(within(confirm).getByRole('textbox'), 'Ghi trùng')
    await user.click(within(confirm).getByRole('button', { name: 'Hủy phiếu' }))
    await waitFor(() => expect(voids).toEqual([{ expectedVersion: 3, reason: 'Ghi trùng' }]))
    expect(await within(drawer).findByText('Phiếu đã hủy')).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Hủy phiếu ghi nhầm' })).toBeNull()
  })
})

describe('Đối chiếu phiếu nhập', () => {
  it('shows unknown amounts as "Chưa rõ" and is hidden without inventory access', async () => {
    seedCashbook()
    server.use(...cashbookReads())
    open('&tab=receipts')
    expect(await screen.findByText('PN-OLD')).toBeInTheDocument()
    expect(screen.getAllByText('Chưa rõ').length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: 'Đối chiếu phiếu nhập' })).toBeInTheDocument()
    cleanup()

    seedCashbook({ features: ['DETAIL_REPORT'] })
    server.use(...cashbookReads())
    open('&tab=receipts')
    // Falls back to Dòng tiền.
    expect(await screen.findByText('Chênh lệch thu chi')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Đối chiếu phiếu nhập' })).toBeNull()
  })
})
