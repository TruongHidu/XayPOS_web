import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { BalancesPage } from '../features/inventory/pages/BalancesPage'
import { DocumentCreatePage } from '../features/inventory/pages/DocumentCreatePage'
import { DocumentDetailPage } from '../features/inventory/pages/DocumentDetailPage'
import { AlertsPage, AlertDetailPage } from '../features/inventory/pages/AlertsPage'
import { AuditDetailPage } from '../features/inventory/pages/AuditDetailPage'
import {
  canAcknowledgeAlert,
  canConfirmStockAudits,
  canInventory,
  canManageStockAudits,
  canWriteDocument,
} from '../features/inventory/policies/inventoryAccessPolicy'
import { createLowStockNotifier } from '../features/inventory/realtime/inventoryAdapter'
import { parseRealtimeEvent } from '../shared/realtime/events'
import { useToastStore } from '../shared/ui/toast'
import { useAuthStore } from '../features/auth/store/authStore'
import { queryClient } from '../shared/api/queryClient'
import { base, failure, page } from './orderFixtures'
import { dates, renderPage, resetTenant, seedTenant } from './managementFixtures'
import { server } from './server'

afterEach(() => {
  cleanup()
  resetTenant()
})

const W = '10000000-0000-4000-8000-000000000001'
const I = '20000000-0000-4000-8000-000000000001'
const I2 = '20000000-0000-4000-8000-000000000002'
const D = '30000000-0000-4000-8000-000000000001'
const A = '40000000-0000-4000-8000-000000000001'
const AU = '50000000-0000-4000-8000-000000000001'
const AI = '60000000-0000-4000-8000-00000000000'

const access = () => {
  const s = useAuthStore.getState()
  return { user: s.user, entitlement: s.entitlement, entitlementState: s.entitlementState }
}
const allFeatures = ['INVENTORY_MANAGEMENT', 'LOW_STOCK_ALERT', 'STOCK_AUDIT']
const warehouse = { id: W, code: 'KHO-CHINH', name: 'Kho chính', isDefault: true, active: true, version: 0, ...dates }
const balance = (overrides: Record<string, unknown> = {}) => ({
  balanceId: null,
  configured: false,
  warehouseId: W,
  warehouseCode: 'KHO-CHINH',
  itemId: I,
  itemType: 'INGREDIENT',
  ingredientId: I,
  ingredientSku: 'NL-BO',
  ingredientName: 'Thịt bò',
  baseUnit: 'g',
  ingredientActive: true,
  quantity: 0,
  reservedQuantity: 0,
  availableQuantity: 0,
  minQuantity: 0,
  lowStock: false,
  version: null,
  createdAt: null,
  updatedAt: null,
  ...overrides,
})
const docLine = { id: '70000000-0000-4000-8000-000000000001', itemId: I, itemType: 'INGREDIENT', ingredientId: I, ingredientSku: 'NL-BO', ingredientName: 'Thịt bò', unit: 'g', quantity: 1000, adjustmentDirection: null, unitCost: 250, totalCost: 250000, note: null }
const doc = (overrides: Record<string, unknown> = {}) => ({
  id: D,
  documentCode: 'PN-1',
  documentType: 'RECEIPT',
  status: 'DRAFT',
  warehouseId: W,
  warehouseCode: 'KHO-CHINH',
  warehouseName: 'Kho chính',
  note: null,
  lineCount: 1,
  totalQuantity: 1000,
  totalCost: 250000,
  createdBy: 'u',
  version: 1,
  stockAuditId: null,
  items: [docLine],
  ...dates,
  ...overrides,
})

describe('inventory policy', () => {
  it('needs INVENTORY_VIEW and the matching feature for sub-permissions', () => {
    seedTenant({ role: 'CASHIER', permissions: ['INVENTORY_RECEIVE', 'INVENTORY_ALERT_ACKNOWLEDGE', 'STOCK_AUDIT_MANAGE'], features: allFeatures })
    expect(canWriteDocument(access(), 'RECEIPT')).toBe(true)
    expect(canWriteDocument(access(), 'ISSUE')).toBe(false)
    expect(canAcknowledgeAlert(access())).toBe(false) // no INVENTORY_VIEW
    expect(canManageStockAudits(access())).toBe(false)
    seedTenant({ permissions: ['INVENTORY_VIEW', 'STOCK_AUDIT_MANAGE', 'STOCK_AUDIT_CONFIRM'], features: ['INVENTORY_MANAGEMENT'] })
    expect(canInventory(access(), 'INVENTORY_VIEW')).toBe(true)
    expect(canManageStockAudits(access())).toBe(false) // no STOCK_AUDIT feature
    expect(canConfirmStockAudits(access())).toBe(false)
  })
})

describe('balances', () => {
  it('opens the default warehouse and sends a null version for the first threshold', async () => {
    seedTenant({ permissions: ['INVENTORY_VIEW', 'INVENTORY_THRESHOLD_UPDATE'], features: allFeatures })
    const bodies: unknown[] = []
    server.use(
      http.get(base + '/inventory/warehouses', () => HttpResponse.json(page([warehouse]))),
      http.get(base + '/inventory/warehouses/:id/balances', () =>
        HttpResponse.json(page([balance(), balance({ itemId: I2, ingredientId: I2, ingredientName: 'Hành', balanceId: '80000000-0000-4000-8000-000000000001', configured: true, version: 4, quantity: 50, availableQuantity: 50, minQuantity: 100, lowStock: true })])),
      ),
      http.patch(base + '/inventory/warehouses/:w/balances/:i/threshold', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(balance({ minQuantity: 200, version: 0, balanceId: '80000000-0000-4000-8000-000000000002' }))
      }),
    )
    const user = userEvent.setup()
    renderPage(<BalancesPage />, { path: '/app/inventory/balances' })
    const row = (await screen.findByText('Thịt bò')).closest('tr')!
    expect(within(screen.getByText('Hành').closest('tr')!).getByText('Tồn thấp')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Ngưỡng' }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText(/Cảnh báo khi tồn/)
    await user.clear(input)
    await user.type(input, '200')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu ngưỡng' }))
    await waitFor(() => expect(bodies[0]).toEqual({ expectedVersion: null, minQuantity: 200 }))

    await user.click(within(screen.getByText('Hành').closest('tr')!).getByRole('button', { name: 'Ngưỡng' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Lưu ngưỡng' }))
    await waitFor(() => expect(bodies[1]).toEqual({ expectedVersion: 4, minQuantity: 100 }))
  })
})

describe('stock documents', () => {
  it('creates a receipt with one idempotency key per content and reuses it on retry', async () => {
    seedTenant({ permissions: ['INVENTORY_VIEW', 'INVENTORY_RECEIVE'], features: allFeatures })
    const keys: string[] = []
    const bodies: unknown[] = []
    let calls = 0
    server.use(
      http.get(base + '/inventory/warehouses', () => HttpResponse.json(page([warehouse]))),
      http.post(base + '/inventory/stock-documents', async ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '')
        bodies.push(await request.json())
        calls++
        if (calls === 1) return failure('INTERNAL_ERROR', 503)
        return HttpResponse.json(doc(), { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderPage(<DocumentCreatePage />, {
      path: '/app/inventory/stock-documents/new',
      entry: `/app/inventory/stock-documents/new?type=RECEIPT&itemId=${I}&name=Th%E1%BB%8Bt%20b%C3%B2&unit=g`,
    })
    expect(await screen.findByText('Thịt bò')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText(/^Kho/)).toHaveValue(W))
    await user.type(screen.getByLabelText('Số lượng'), '1000')
    expect(screen.getByText(/đơn giá 0 đ/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Đơn giá/), '250')
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    expect(await screen.findByText(/Chưa rõ phiếu đã được lưu hay chưa/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    expect(await screen.findByTestId('location')).toHaveTextContent(`/app/inventory/stock-documents/${D}`)
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
    expect(bodies[0]).toEqual({ documentType: 'RECEIPT', warehouseId: W, items: [{ itemId: I, quantity: 1000, unitCost: 250 }] })
  })

  it('confirms a draft and keeps audit-generated documents read-only', async () => {
    seedTenant({ permissions: ['INVENTORY_VIEW', 'INVENTORY_RECEIVE', 'INVENTORY_ADJUST'], features: allFeatures })
    let confirm: unknown
    server.use(
      http.get(base + '/inventory/stock-documents/:id', () => HttpResponse.json(doc())),
      http.post(base + '/inventory/stock-documents/:id/confirm', async ({ request }) => {
        confirm = await request.json()
        return failure('INSUFFICIENT_AVAILABLE_STOCK')
      }),
    )
    const user = userEvent.setup()
    const { unmount } = renderPage(<DocumentDetailPage />, { path: '/app/inventory/stock-documents/:documentId', entry: `/app/inventory/stock-documents/${D}` })
    await user.click(await screen.findByRole('button', { name: 'Xác nhận phiếu' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xác nhận phiếu' }))
    await waitFor(() => expect(confirm).toEqual({ expectedVersion: 1 }))
    expect(await screen.findByText(/đang được giữ cho đơn chưa phục vụ/)).toBeInTheDocument()
    unmount()
    queryClient.clear()

    server.use(http.get(base + '/inventory/stock-documents/:id', () => HttpResponse.json(doc({ documentType: 'ADJUSTMENT', stockAuditId: AU }))))
    renderPage(<DocumentDetailPage />, { path: '/app/inventory/stock-documents/:documentId', entry: `/app/inventory/stock-documents/${D}` })
    expect(await screen.findByText(/chỉ xem, không sửa được/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác nhận phiếu' })).not.toBeInTheDocument()
  })
})

describe('low-stock alerts', () => {
  const alert = (overrides: Record<string, unknown> = {}) => ({
    id: A,
    warehouseId: W,
    warehouseCode: 'KHO-CHINH',
    warehouseName: 'Kho chính',
    itemId: I,
    itemType: 'INGREDIENT',
    ingredientId: I,
    ingredientSku: 'NL-BO',
    ingredientName: 'Thịt bò',
    unit: 'g',
    status: 'OPEN',
    quantityAtTrigger: 150,
    thresholdQuantity: 200,
    currentQuantity: null,
    reservedQuantity: null,
    availableQuantity: null,
    currentMinQuantity: null,
    triggeredAt: dates.createdAt,
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedAt: null,
    resolutionReason: null,
    version: 2,
    ...dates,
    ...overrides,
  })

  it('acknowledges with the current version and never shows missing live numbers as 0', async () => {
    seedTenant({ permissions: ['INVENTORY_VIEW', 'INVENTORY_ALERT_ACKNOWLEDGE'], features: allFeatures })
    let ack: unknown
    server.use(
      http.get(base + '/inventory/warehouses', () => HttpResponse.json(page([warehouse]))),
      http.get(base + '/inventory/alerts', () => HttpResponse.json(page([alert()]))),
      http.post(base + '/inventory/alerts/:id/acknowledge', async ({ request }) => {
        ack = await request.json()
        return HttpResponse.json(alert({ status: 'ACKNOWLEDGED', version: 3 }))
      }),
    )
    const user = userEvent.setup()
    renderPage(<AlertsPage />, { path: '/app/inventory/alerts' })
    const row = (await screen.findByText('Thịt bò')).closest('tr')!
    expect(within(row).getByText('Không còn dữ liệu so sánh')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Đã xem' }))
    await waitFor(() => expect(ack).toEqual({ expectedVersion: 2 }))
  })

  it('shows the alert history and a receipt shortcut', async () => {
    seedTenant({ permissions: ['INVENTORY_VIEW', 'INVENTORY_RECEIVE'], features: allFeatures })
    server.use(http.get(base + '/inventory/alerts/:id', () => HttpResponse.json(alert({ status: 'RESOLVED', resolvedAt: dates.updatedAt, resolutionReason: 'STOCK_RECOVERED' }))))
    renderPage(<AlertDetailPage />, { path: '/app/inventory/alerts/:alertId', entry: `/app/inventory/alerts/${A}` })
    expect(await screen.findByText(/Tồn đã vượt ngưỡng/)).toBeInTheDocument()
    expect(screen.getByText('Chưa có xác nhận đã xem.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Nhập kho' })).not.toBeInTheDocument() // resolved
  })

  it('parses the realtime event and gathers new episodes into one toast', async () => {
    const event = parseRealtimeEvent(
      JSON.stringify({
        eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        type: 'INVENTORY_LOW_STOCK_ALERT_CHANGED',
        schemaVersion: 1,
        resourceType: 'LOW_STOCK_ALERT',
        resourceId: A,
        resourceVersion: 0,
        occurredAt: '2026-10-24T08:00:00Z',
        payload: { warehouseId: W, ingredientId: I, status: 'OPEN', resolutionReason: null },
      }),
    )
    expect(event?.type).toBe('INVENTORY_LOW_STOCK_ALERT_CHANGED')
    const notifier = createLowStockNotifier(10)
    if (event?.type === 'INVENTORY_LOW_STOCK_ALERT_CHANGED') {
      notifier.push(event)
      notifier.push(event)
      notifier.push({ ...event, payload: { ...event.payload, status: 'RESOLVED' } })
    }
    await waitFor(() => expect(useToastStore.getState().items).toHaveLength(1))
    expect(useToastStore.getState().items[0].message).toMatch(/^2 mặt hàng/)
  })
})

describe('stock audit count sheet', () => {
  const audit = (overrides: Record<string, unknown> = {}) => ({
    id: AU,
    auditCode: 'AUD-1',
    warehouseId: W,
    warehouseCode: 'KHO-CHINH',
    warehouseName: 'Kho chính',
    status: 'COUNTING',
    note: null,
    itemCount: 2,
    countedItemCount: 0,
    changedItemCount: 0,
    adjustmentDocumentId: null,
    adjustmentDocumentCode: null,
    version: 3,
    startedAt: dates.createdAt,
    confirmedAt: null,
    cancelledAt: null,
    ...dates,
    ...overrides,
  })
  const item = (n: number, overrides: Record<string, unknown> = {}) => ({
    id: `${AI}${n}`,
    itemId: n === 1 ? I : I2,
    itemType: 'INGREDIENT',
    ingredientId: n === 1 ? I : I2,
    sku: null,
    name: n === 1 ? 'Thịt bò' : 'Hành',
    unit: 'g',
    systemQuantity: 10,
    countedQuantity: null,
    differenceQuantity: null,
    referenceUnitCostSnapshot: 250,
    note: null,
    ...overrides,
  })

  it('sends only entered counts, keeps empty cells uncounted and handles a stale snapshot', async () => {
    seedTenant({ permissions: ['INVENTORY_VIEW', 'STOCK_AUDIT_MANAGE', 'STOCK_AUDIT_CONFIRM'], features: allFeatures })
    let counts: unknown
    let current = audit()
    server.use(
      http.get(base + '/inventory/audits/:id', () => HttpResponse.json(current)),
      http.get(base + '/inventory/audits/:id/items', () => HttpResponse.json({ ...page([item(1), item(2)]), size: 100 })),
      http.patch(base + '/inventory/audits/:id/items', async ({ request }) => {
        counts = await request.json()
        current = audit({ version: 4, countedItemCount: 2, changedItemCount: 1 })
        return HttpResponse.json(current)
      }),
      http.post(base + '/inventory/audits/:id/confirm', () => failure('STOCK_AUDIT_SNAPSHOT_STALE')),
    )
    const user = userEvent.setup()
    renderPage(<AuditDetailPage />, { path: '/app/inventory/audits/:auditId', entry: `/app/inventory/audits/${AU}` })
    const confirm = await screen.findByRole('button', { name: 'Chốt kiểm kê' })
    expect(confirm).toBeDisabled() // nothing counted yet
    await user.type(await screen.findByLabelText('Số đếm Thịt bò'), '8')
    await user.click(within(screen.getByText('Hành').closest('tr')!).getByRole('button', { name: 'Khớp' }))
    expect(screen.getByText('2 dòng chưa lưu')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lưu số đếm' }))
    await waitFor(() =>
      expect(counts).toEqual({
        expectedVersion: 3,
        items: [
          { auditItemId: `${AI}1`, countedQuantity: 8 },
          { auditItemId: `${AI}2`, countedQuantity: 10 },
        ],
      }),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Chốt kiểm kê' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Chốt kiểm kê' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Chốt kiểm kê' }))
    expect(await screen.findByText('Số liệu không còn khớp')).toBeInTheDocument()
  })
})
