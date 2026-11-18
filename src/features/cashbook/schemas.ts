import { z } from 'zod'
import { pageSchema } from '../../shared/api/tenantSchemas'

// Cashbook DTOs (XayPOS_be/docs/cashbook-api.md, openapi/cashbook-api.yaml).
// Amounts are plain decimals; the server owns every total.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const amount = z.number()
const count = z.number().int().nonnegative()

export const cashbookMetaSchema = z.object({
  fromDate: isoDate.nullish(),
  toDate: isoDate.nullish(),
  timezone: z.string(),
  currencyCode: z.string(),
  dateBasis: z.string().nullish(),
  granularity: z.string().nullish(),
  generatedAt: z.string(),
})
export type CashbookMeta = z.infer<typeof cashbookMetaSchema>

const envelope = <T extends z.ZodType>(data: T) => z.object({ meta: cashbookMetaSchema, data })

export const entryTypes = ['INCOME', 'EXPENSE'] as const
export type EntryType = (typeof entryTypes)[number]
export const paymentMethods = ['CASH', 'TRANSFER'] as const
export type CashbookPaymentMethod = (typeof paymentMethods)[number]

export const categorySchema = z.object({
  id: z.string().nullish(),
  code: z.string(),
  name: z.string(),
  type: z.enum(entryTypes),
  active: z.boolean(),
})
export type CashbookCategory = z.infer<typeof categorySchema>

export const entrySchema = z.object({
  sourceType: z.enum(['ORDER_PAYMENT', 'EXPENSE_VOUCHER']),
  sourceId: z.string(),
  code: z.string(),
  type: z.enum(entryTypes),
  categoryCode: z.string(),
  categoryName: z.string(),
  amount,
  currencyCode: z.string(),
  paymentMethod: z.string(),
  occurredAt: z.string(),
  recordedAt: z.string().nullish(),
  createdBy: z.string().nullish(),
  orderId: z.string().nullish(),
  orderCode: z.string().nullish(),
  stockDocumentId: z.string().nullish(),
  sourceDocumentCode: z.string().nullish(),
})
export type CashbookEntry = z.infer<typeof entrySchema>

export const summarySchema = z.object({
  totalIncomeAmount: amount,
  totalExpenseAmount: amount,
  netCashFlowAmount: amount,
  incomeEntryCount: count,
  expenseEntryCount: count,
  saleIncomeAmount: amount,
  receiptLinkedExpenseAmount: amount,
  otherExpenseAmount: amount,
})
export type CashbookSummary = z.infer<typeof summarySchema>

export const seriesPointSchema = z.object({
  bucketStartDate: isoDate,
  totalIncomeAmount: amount,
  totalExpenseAmount: amount,
  netCashFlowAmount: amount,
  incomeEntryCount: count,
  expenseEntryCount: count,
})
export type CashbookSeriesPoint = z.infer<typeof seriesPointSchema>

export const expenseSchema = z.object({
  id: z.string(),
  expenseCode: z.string(),
  categoryCode: z.string(),
  categoryName: z.string(),
  amount,
  currencyCode: z.string(),
  paymentMethod: z.enum(paymentMethods),
  expenseAt: z.string(),
  stockDocumentId: z.string().nullish(),
  sourceDocumentCode: z.string().nullish(),
  sourceCurrencyStatus: z.string().nullish(),
  referenceNo: z.string().nullish(),
  payeeName: z.string().nullish(),
  note: z.string().nullish(),
  status: z.enum(['POSTED', 'VOIDED']),
  createdBy: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string().nullish(),
  version: z.number().int().nonnegative(),
  voidedBy: z.string().nullish(),
  voidedAt: z.string().nullish(),
  voidReason: z.string().nullish(),
})
export type Expense = z.infer<typeof expenseSchema>

export const stockReceiptSchema = z.object({
  stockDocumentId: z.string(),
  documentCode: z.string(),
  warehouseId: z.string().nullish(),
  warehouseName: z.string().nullish(),
  confirmedAt: z.string(),
  totalCost: amount,
  currencyCode: z.string().nullish(),
  currencyStatus: z.enum(['KNOWN', 'UNKNOWN']),
  linkedPostedExpenseCount: count,
  recordedExpenseAmountAllTime: amount.nullable(),
})
export type StockReceipt = z.infer<typeof stockReceiptSchema>

export const categoriesResponseSchema = z.array(categorySchema)
export const entriesResponseSchema = envelope(pageSchema(entrySchema))
export const summaryResponseSchema = envelope(summarySchema)
export const seriesResponseSchema = envelope(z.array(seriesPointSchema))
export const expensesResponseSchema = envelope(pageSchema(expenseSchema))
export const stockReceiptsResponseSchema = envelope(pageSchema(stockReceiptSchema))

// ── URL criteria ─────────────────────────────────────────────────────────────

/** Period shared by every tab (the restaurant's local calendar dates). */
export const cashbookRangeSchema = z.object({
  from: isoDate,
  to: isoDate,
  granularity: z.enum(['', 'DAY', 'MONTH']),
})
export type CashbookRange = z.infer<typeof cashbookRangeSchema>

const methodFilter = z.enum(['', ...paymentMethods])
const categoryFilter = z.string().max(50)
const search = z.string().max(100)

/** Dòng tiền: filters shared by summary, series and entries. */
export const flowCriteriaSchema = z.object({
  type: z.enum(['', ...entryTypes]),
  categoryCode: categoryFilter,
  paymentMethod: methodFilter,
  q: search,
  page: z.number().int().min(0),
  sortBy: z.enum(['occurredAt', 'amount', 'code']),
  direction: z.enum(['asc', 'desc']),
})
export type FlowCriteria = z.infer<typeof flowCriteriaSchema>
export const flowDefaults: FlowCriteria = { type: '', categoryCode: '', paymentMethod: '', q: '', page: 0, sortBy: 'occurredAt', direction: 'desc' }

export const expenseCriteriaSchema = z.object({
  estatus: z.enum(['', 'POSTED', 'VOIDED']),
  ecategory: categoryFilter,
  emethod: methodFilter,
  eq: search,
  epage: z.number().int().min(0),
  esortBy: z.enum(['expenseAt', 'amount', 'expenseCode', 'createdAt']),
  edirection: z.enum(['asc', 'desc']),
})
export type ExpenseCriteria = z.infer<typeof expenseCriteriaSchema>
export const expenseDefaults: ExpenseCriteria = { estatus: '', ecategory: '', emethod: '', eq: '', epage: 0, esortBy: 'expenseAt', edirection: 'desc' }

export const receiptCriteriaSchema = z.object({
  rwarehouse: z.string(),
  rq: search,
  runknown: z.boolean(),
  rpage: z.number().int().min(0),
  rsortBy: z.enum(['confirmedAt', 'documentCode', 'totalCost']),
  rdirection: z.enum(['asc', 'desc']),
})
export type ReceiptCriteria = z.infer<typeof receiptCriteriaSchema>
export const receiptDefaults: ReceiptCriteria = { rwarehouse: '', rq: '', runknown: false, rpage: 0, rsortBy: 'confirmedAt', rdirection: 'desc' }

// ── Create expense form ──────────────────────────────────────────────────────

export interface CreateExpenseBody {
  categoryCode: string
  amount: number
  paymentMethod: CashbookPaymentMethod
  expenseAt: string
  stockDocumentId?: string
  referenceNo?: string
  payeeName?: string
  note?: string
}
