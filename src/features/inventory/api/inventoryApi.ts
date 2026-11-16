import { idempotencyHeaders } from '../../../shared/api/idempotency'
import { enc, tenantGet, tenantSend, tenantSendVoid } from '../../../shared/api/tenantApi'
import { tenantKeys } from '../../../shared/api/tenantKeys'
import { parseIsoDate } from '../../../shared/ui/dateRange'
import {
  alertPageSchema,
  alertSchema,
  auditDetailSchema,
  auditItemPageSchema,
  auditPageSchema,
  balancePageSchema,
  balanceSchema,
  documentDetailSchema,
  documentPageSchema,
  stockItemPageSchema,
  transactionPageSchema,
  warehousePageSchema,
  warehouseSchema,
  type AlertCriteria,
  type AuditCriteria,
  type AuditItemCriteria,
  type BalanceCriteria,
  type DocumentCriteria,
  type DocumentType,
  type TransactionCriteria,
} from '../schemas'

const CODE = 'INVALID_INVENTORY_RESPONSE'
const B = '/inventory'

/** Keys under `inventory`. Confirming documents/audits invalidates `root` (balances, ledger, alerts…). */
export const inventoryKeys = {
  root: (scope: string | null) => tenantKeys.module(scope, 'inventory'),
  warehouses: (scope: string | null) => [...inventoryKeys.root(scope), 'warehouses'] as const,
  balances: (scope: string | null, c: BalanceCriteria) => [...inventoryKeys.root(scope), 'balances', c] as const,
  lowStock: (scope: string | null, params: object) => [...inventoryKeys.root(scope), 'low-stock', params] as const,
  stockItems: (scope: string | null, q: string) => [...inventoryKeys.root(scope), 'stock-items', q] as const,
  documents: (scope: string | null) => [...inventoryKeys.root(scope), 'documents'] as const,
  documentList: (scope: string | null, c: DocumentCriteria) => [...inventoryKeys.documents(scope), 'list', c] as const,
  document: (scope: string | null, id: string) => [...inventoryKeys.documents(scope), 'detail', id] as const,
  transactions: (scope: string | null, c: TransactionCriteria) => [...inventoryKeys.root(scope), 'transactions', c] as const,
  alerts: (scope: string | null) => [...inventoryKeys.root(scope), 'alerts'] as const,
  alertList: (scope: string | null, c: AlertCriteria) => [...inventoryKeys.alerts(scope), 'list', c] as const,
  alert: (scope: string | null, id: string) => [...inventoryKeys.alerts(scope), 'detail', id] as const,
  openAlertCount: (scope: string | null) => [...inventoryKeys.alerts(scope), 'open-count'] as const,
  audits: (scope: string | null) => [...inventoryKeys.root(scope), 'audits'] as const,
  auditList: (scope: string | null, c: AuditCriteria) => [...inventoryKeys.audits(scope), 'list', c] as const,
  audit: (scope: string | null, id: string) => [...inventoryKeys.audits(scope), 'detail', id] as const,
  auditItems: (scope: string | null, id: string, c: AuditItemCriteria) => [...inventoryKeys.audits(scope), 'items', id, c] as const,
}

const bool = (value: '' | 'true' | 'false') => (value === '' ? undefined : value === 'true')

/** Local calendar day → ISO instant at its start (`end` gives the next day's start, exclusive). */
export function dayStartIso(day: string, end = false) {
  const date = parseIsoDate(day)
  if (!date) return undefined
  if (end) date.setDate(date.getDate() + 1)
  return date.toISOString()
}

export interface DocumentLineInput {
  itemId: string
  quantity: number
  unitCost?: number
  adjustmentDirection?: 'INCREASE' | 'DECREASE'
  note?: string
}

export const inventoryApi = {
  // ── Warehouses ────────────────────────────────────────
  warehouses: (scope: string, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/warehouses`, warehousePageSchema, { signal, code: CODE, params: { page: 0, size: 100, sortBy: 'code', direction: 'asc' } }),
  createWarehouse: (scope: string, body: { code: string; name: string }) =>
    tenantSend(scope, 'post', `${B}/warehouses`, body, warehouseSchema, { code: CODE }),
  updateWarehouse: (scope: string, id: string, expectedVersion: number, body: { code?: string; name?: string }) =>
    tenantSend(scope, 'patch', `${B}/warehouses/${enc(id)}`, { ...body, expectedVersion }, warehouseSchema, { code: CODE }),
  setWarehouseActive: (scope: string, id: string, expectedVersion: number, active: boolean) =>
    tenantSend(scope, 'patch', `${B}/warehouses/${enc(id)}/status`, { active, expectedVersion }, warehouseSchema, { code: CODE }),
  makeDefault: (scope: string, id: string, expectedVersion: number) =>
    tenantSend(scope, 'post', `${B}/warehouses/${enc(id)}/make-default`, { expectedVersion }, warehouseSchema, { code: CODE }),
  deleteWarehouse: (scope: string, id: string, expectedVersion: number) =>
    tenantSendVoid(scope, 'delete', `${B}/warehouses/${enc(id)}`, { params: { expectedVersion } }),

  // ── Balances ──────────────────────────────────────────
  balances: (scope: string, c: BalanceCriteria, signal?: AbortSignal) =>
    c.low === 'true'
      ? tenantGet(scope, `${B}/low-stock`, balancePageSchema, {
          signal,
          code: CODE,
          params: { warehouseId: c.warehouseId, q: c.q, ingredientActive: bool(c.active), page: c.page, size: 20, sortBy: c.sortBy, direction: c.direction },
        })
      : tenantGet(scope, `${B}/warehouses/${enc(c.warehouseId)}/balances`, balancePageSchema, {
          signal,
          code: CODE,
          params: { q: c.q, ingredientActive: bool(c.active), page: c.page, size: 20, sortBy: c.sortBy, direction: c.direction },
        }),
  lowStock: (scope: string, params: { warehouseId?: string; page?: number; size?: number }, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/low-stock`, balancePageSchema, {
      signal,
      code: CODE,
      params: { ...params, page: params.page ?? 0, size: params.size ?? 20, sortBy: 'quantity', direction: 'asc' },
    }),
  /** First threshold of a logical (row-less) balance sends `expectedVersion: null`. */
  setThreshold: (scope: string, warehouseId: string, itemId: string, expectedVersion: number | null, minQuantity: number) =>
    tenantSend(scope, 'patch', `${B}/warehouses/${enc(warehouseId)}/balances/${enc(itemId)}/threshold`, { expectedVersion, minQuantity }, balanceSchema, {
      code: CODE,
    }),
  stockItems: (scope: string, q: string, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/stock-items`, stockItemPageSchema, { signal, code: CODE, params: { q, page: 0, size: 20 } }),

  // ── Stock documents ───────────────────────────────────
  documents: (scope: string, c: DocumentCriteria, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/stock-documents`, documentPageSchema, {
      signal,
      code: CODE,
      params: {
        q: c.q,
        type: c.type,
        status: c.status,
        warehouseId: c.warehouseId,
        createdFrom: c.from ? dayStartIso(c.from) : undefined,
        createdTo: c.to ? dayStartIso(c.to, true) : undefined,
        page: c.page,
        size: 20,
      },
    }),
  document: (scope: string, id: string, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/stock-documents/${enc(id)}`, documentDetailSchema, { signal, code: CODE }),
  /** Creates a DRAFT; keep the same key when retrying an uncertain result. */
  createDocument: (
    scope: string,
    body: { documentType: DocumentType; warehouseId: string; note?: string; items: DocumentLineInput[] },
    idempotencyKey: string,
  ) => tenantSend(scope, 'post', `${B}/stock-documents`, body, documentDetailSchema, { code: CODE, headers: idempotencyHeaders(idempotencyKey) }),
  updateDocumentNote: (scope: string, id: string, expectedVersion: number, note: string) =>
    tenantSend(scope, 'patch', `${B}/stock-documents/${enc(id)}`, { expectedVersion, note }, documentDetailSchema, { code: CODE }),
  addDocumentItem: (scope: string, id: string, expectedVersion: number, line: DocumentLineInput) =>
    tenantSend(scope, 'post', `${B}/stock-documents/${enc(id)}/items`, { ...line, expectedVersion }, documentDetailSchema, { code: CODE }),
  updateDocumentItem: (scope: string, id: string, itemId: string, expectedVersion: number, line: Omit<DocumentLineInput, 'itemId'>) =>
    tenantSend(scope, 'patch', `${B}/stock-documents/${enc(id)}/items/${enc(itemId)}`, { ...line, expectedVersion }, documentDetailSchema, { code: CODE }),
  deleteDocumentItem: (scope: string, id: string, itemId: string, expectedVersion: number) =>
    tenantSendVoid(scope, 'delete', `${B}/stock-documents/${enc(id)}/items/${enc(itemId)}`, { params: { expectedVersion } }),
  confirmDocument: (scope: string, id: string, expectedVersion: number) =>
    tenantSend(scope, 'post', `${B}/stock-documents/${enc(id)}/confirm`, { expectedVersion }, documentDetailSchema, { code: CODE }),
  cancelDocument: (scope: string, id: string, expectedVersion: number) =>
    tenantSend(scope, 'post', `${B}/stock-documents/${enc(id)}/cancel`, { expectedVersion }, documentDetailSchema, { code: CODE }),

  // ── Ledger ────────────────────────────────────────────
  transactions: (scope: string, c: TransactionCriteria, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/transactions`, transactionPageSchema, {
      signal,
      code: CODE,
      params: {
        warehouseId: c.warehouseId,
        ingredientId: c.ingredientId,
        documentId: c.documentId,
        orderId: c.orderId,
        transactionType: c.transactionType,
        createdFrom: c.from ? dayStartIso(c.from) : undefined,
        createdTo: c.to ? dayStartIso(c.to, true) : undefined,
        page: c.page,
        size: 20,
      },
    }),

  // ── Low-stock alerts ──────────────────────────────────
  alerts: (scope: string, c: AlertCriteria, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/alerts`, alertPageSchema, {
      signal,
      code: CODE,
      params: { status: c.status, warehouseId: c.warehouseId, q: c.q, page: c.page, size: 20 },
    }),
  openAlertCount: (scope: string, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/alerts`, alertPageSchema, { signal, code: CODE, params: { status: 'OPEN', page: 0, size: 1 } }),
  alert: (scope: string, id: string, signal?: AbortSignal) => tenantGet(scope, `${B}/alerts/${enc(id)}`, alertSchema, { signal, code: CODE }),
  /** "Đã xem" — never means the stock was replenished. */
  acknowledgeAlert: (scope: string, id: string, expectedVersion: number) =>
    tenantSend(scope, 'post', `${B}/alerts/${enc(id)}/acknowledge`, { expectedVersion }, alertSchema, { code: CODE }),

  // ── Stock audits ──────────────────────────────────────
  audits: (scope: string, c: AuditCriteria, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/audits`, auditPageSchema, {
      signal,
      code: CODE,
      params: { status: c.status, warehouseId: c.warehouseId, q: c.q, page: c.page, size: 20 },
    }),
  audit: (scope: string, id: string, signal?: AbortSignal) => tenantGet(scope, `${B}/audits/${enc(id)}`, auditDetailSchema, { signal, code: CODE }),
  auditItems: (scope: string, id: string, c: AuditItemCriteria, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/audits/${enc(id)}/items`, auditItemPageSchema, {
      signal,
      code: CODE,
      params: { q: c.iq, counted: bool(c.counted), differenceOnly: c.diff === 'true' || undefined, page: c.ipage, size: 100, sortBy: 'name', direction: 'asc' },
    }),
  createAudit: (scope: string, body: { warehouseId: string; note?: string }, idempotencyKey: string) =>
    tenantSend(scope, 'post', `${B}/audits`, body, auditDetailSchema, { code: CODE, headers: idempotencyHeaders(idempotencyKey) }),
  startAudit: (scope: string, id: string, expectedVersion: number) =>
    tenantSend(scope, 'post', `${B}/audits/${enc(id)}/start`, { expectedVersion }, auditDetailSchema, { code: CODE }),
  /** At most 100 lines; one header version step per changed batch. */
  countAudit: (scope: string, id: string, expectedVersion: number, items: Array<{ auditItemId: string; countedQuantity: number; note?: string }>) =>
    tenantSend(scope, 'patch', `${B}/audits/${enc(id)}/items`, { expectedVersion, items }, auditDetailSchema, { code: CODE }),
  confirmAudit: (scope: string, id: string, expectedVersion: number) =>
    tenantSend(scope, 'post', `${B}/audits/${enc(id)}/confirm`, { expectedVersion }, auditDetailSchema, { code: CODE }),
  cancelAudit: (scope: string, id: string, expectedVersion: number, note?: string) =>
    tenantSend(scope, 'post', `${B}/audits/${enc(id)}/cancel`, { expectedVersion, ...(note ? { note } : {}) }, auditDetailSchema, { code: CODE }),
}
