import { idempotencyHeaders } from '../../../shared/api/idempotency'
import { enc, tenantGet, tenantSend, tenantSendWithHeaders } from '../../../shared/api/tenantApi'
import { tenantKeys } from '../../../shared/api/tenantKeys'
import {
  categoriesResponseSchema,
  entriesResponseSchema,
  expenseSchema,
  expensesResponseSchema,
  seriesResponseSchema,
  stockReceiptsResponseSchema,
  summaryResponseSchema,
  type CashbookRange,
  type CreateExpenseBody,
  type ExpenseCriteria,
  type FlowCriteria,
  type ReceiptCriteria,
} from '../schemas'

const CODE = 'INVALID_CASHBOOK_RESPONSE'
const B = '/cashbook'
const SIZE = 20

const period = (r: Pick<CashbookRange, 'from' | 'to'>) => ({ from: r.from, to: r.to })
const flowFilters = (f: FlowCriteria) => ({ type: f.type, categoryCode: f.categoryCode, paymentMethod: f.paymentMethod, q: f.q })

/**
 * Keys under `cashbook`. Creating or voiding an expense invalidates `root`, so
 * entries, summary, series, expense history and receipt reconciliation reload
 * together (cashbook-fe-sync.md).
 */
export const cashbookKeys = {
  root: (scope: string | null) => tenantKeys.module(scope, 'cashbook'),
  categories: (scope: string | null) => [...cashbookKeys.root(scope), 'categories'] as const,
  summary: (scope: string | null, r: CashbookRange, f: FlowCriteria) => [...cashbookKeys.root(scope), 'summary', period(r), flowFilters(f)] as const,
  series: (scope: string | null, r: CashbookRange, f: FlowCriteria, granularity: string) =>
    [...cashbookKeys.root(scope), 'series', period(r), flowFilters(f), granularity] as const,
  entries: (scope: string | null, r: CashbookRange, f: FlowCriteria) => [...cashbookKeys.root(scope), 'entries', period(r), f] as const,
  expenses: (scope: string | null) => [...cashbookKeys.root(scope), 'expenses'] as const,
  expenseList: (scope: string | null, r: CashbookRange, c: ExpenseCriteria) => [...cashbookKeys.expenses(scope), 'list', period(r), c] as const,
  expense: (scope: string | null, id: string) => [...cashbookKeys.expenses(scope), 'detail', id] as const,
  receipts: (scope: string | null, params: object) => [...cashbookKeys.root(scope), 'stock-receipts', params] as const,
}

const flowParams = (r: CashbookRange, f: FlowCriteria) => ({
  fromDate: r.from,
  toDate: r.to,
  type: f.type || undefined,
  categoryCode: f.categoryCode || undefined,
  paymentMethod: f.paymentMethod || undefined,
  q: f.q.trim() || undefined,
})

export interface ReceiptQuery {
  from: string
  to: string
  warehouseId?: string
  q?: string
  includeUnknownCurrency?: boolean
  page: number
  sortBy?: ReceiptCriteria['rsortBy']
  direction?: 'asc' | 'desc'
}

export const cashbookApi = {
  categories: (scope: string, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/categories`, categoriesResponseSchema, { signal, code: CODE, params: { type: 'EXPENSE' } }),
  summary: (scope: string, r: CashbookRange, f: FlowCriteria, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/summary`, summaryResponseSchema, { signal, code: CODE, params: flowParams(r, f) }),
  series: (scope: string, r: CashbookRange, f: FlowCriteria, granularity: 'DAY' | 'MONTH', signal?: AbortSignal) =>
    tenantGet(scope, `${B}/series`, seriesResponseSchema, { signal, code: CODE, params: { ...flowParams(r, f), granularity } }),
  entries: (scope: string, r: CashbookRange, f: FlowCriteria, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/entries`, entriesResponseSchema, {
      signal,
      code: CODE,
      params: { ...flowParams(r, f), page: f.page, size: SIZE, sortBy: f.sortBy, direction: f.direction },
    }),
  expenses: (scope: string, r: CashbookRange, c: ExpenseCriteria, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/expenses`, expensesResponseSchema, {
      signal,
      code: CODE,
      params: {
        fromDate: r.from,
        toDate: r.to,
        status: c.estatus || undefined,
        categoryCode: c.ecategory || undefined,
        paymentMethod: c.emethod || undefined,
        q: c.eq.trim() || undefined,
        page: c.epage,
        size: SIZE,
        sortBy: c.esortBy,
        direction: c.edirection,
      },
    }),
  expense: (scope: string, id: string, signal?: AbortSignal) => tenantGet(scope, `${B}/expenses/${enc(id)}`, expenseSchema, { signal, code: CODE }),
  /** `replayed` is true when the server answered an earlier request with the same key. */
  createExpense: async (scope: string, body: CreateExpenseBody, idempotencyKey: string) => {
    const result = await tenantSendWithHeaders(scope, 'post', `${B}/expenses`, body, expenseSchema, {
      code: CODE,
      headers: idempotencyHeaders(idempotencyKey),
    })
    const header = result.headers['idempotency-replayed']
    // The header may be hidden by CORS; a 200 (not 201) also means "replay".
    return { expense: result.data, replayed: header ? header === 'true' : result.status === 200 }
  },
  voidExpense: (scope: string, id: string, expectedVersion: number, reason: string) =>
    tenantSend(scope, 'post', `${B}/expenses/${enc(id)}/void`, { expectedVersion, reason }, expenseSchema, { code: CODE }),
  stockReceipts: (scope: string, query: ReceiptQuery, signal?: AbortSignal) =>
    tenantGet(scope, `${B}/stock-receipts`, stockReceiptsResponseSchema, {
      signal,
      code: CODE,
      params: {
        fromDate: query.from,
        toDate: query.to,
        warehouseId: query.warehouseId || undefined,
        q: query.q?.trim() || undefined,
        includeUnknownCurrency: query.includeUnknownCurrency || undefined,
        page: query.page,
        size: SIZE,
        sortBy: query.sortBy ?? 'confirmedAt',
        direction: query.direction ?? 'desc',
      },
    }),
}
