import { z } from 'zod'
import { pageSchema } from '../../shared/api/tenantSchemas'

// Report DTOs (XayPOS_be/docs/report-api.md, reference-margin-report-api.md).
// Amounts are plain numbers: margins may be negative and the server owns all maths.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const count = z.number().int().nonnegative()
const amount = z.number()
const percent = z.number().nullable()

export const reportMetaSchema = z.object({
  fromDate: isoDate,
  toDate: isoDate,
  timezone: z.string(),
  currencyCode: z.string(),
  generatedAt: z.string(),
  serviceType: z.string().nullable().optional(),
  sourceChannel: z.string().nullable().optional(),
  granularity: z.string().nullable().optional(),
  dateBasis: z.string().nullable().optional(),
})
export type ReportMeta = z.infer<typeof reportMetaSchema>

export const envelope = <T extends z.ZodType>(data: T) => z.object({ meta: reportMetaSchema, data })

/** /reports/daily and /reports/summary. */
export const overviewDataSchema = z.object({
  collections: z.object({ collectedAmount: amount, successfulPaymentCount: count, paidOrderCount: count }),
  orders: z.object({
    createdOrderCount: count,
    completedOrderCount: count,
    cancelledOrderCount: count,
    completedSubtotalAmount: amount,
    completedDiscountAmount: amount,
    completedTaxAmount: amount,
    completedServiceChargeAmount: amount,
    completedOrderSalesAmount: amount,
    averageCompletedOrderValue: amount,
  }),
})
export type OverviewData = z.infer<typeof overviewDataSchema>

export const seriesPointSchema = z.object({
  bucketStartDate: isoDate,
  collectedAmount: amount,
  completedOrderSalesAmount: amount,
  successfulPaymentCount: count,
  completedOrderCount: count,
})
export type SeriesPoint = z.infer<typeof seriesPointSchema>

export const paymentMethodRowSchema = z.object({
  paymentMethod: z.string(),
  collectedAmount: amount,
  successfulPaymentCount: count,
  percentage: z.number(),
})

export const topItemSchema = z.object({
  itemId: z.string().nullable(),
  itemName: z.string(),
  unit: z.string(),
  quantity: z.number(),
  itemSalesAmount: amount,
  completedOrderCount: count,
})
export type TopItem = z.infer<typeof topItemSchema>

export const reportOrderSchema = z.object({
  id: z.string(),
  orderCode: z.string(),
  serviceType: z.string(),
  sourceChannel: z.string(),
  status: z.string(),
  paymentStatus: z.string(),
  currencyCode: z.string(),
  totalAmount: amount,
  collectedAmountInRange: amount,
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  reportEventAt: z.string(),
})
export type ReportOrder = z.infer<typeof reportOrderSchema>

export const costIssueSchema = z.object({ code: z.string(), orderCount: count, itemCount: count })

export const marginSummarySchema = z.object({
  costBasis: z.string().optional(),
  marginScope: z.string().optional(),
  costCoverageStatus: z.enum(['COMPLETE', 'PARTIAL', 'UNAVAILABLE', 'NO_DATA']),
  completedOrderCount: count,
  fullyCostedOrderCount: count,
  excludedOrderCount: count,
  orderCoveragePercent: percent,
  subtotalAmount: amount,
  discountAmount: amount,
  taxAmount: amount,
  serviceChargeAmount: amount,
  salesAmount: amount,
  netSalesAmount: amount,
  coveredNetSalesAmount: amount,
  coveredReferenceCostAmount: amount,
  coveredReferenceMarginAmount: amount,
  coveredReferenceMarginPercent: percent,
  costIssues: z.array(costIssueSchema),
})
export type MarginSummary = z.infer<typeof marginSummarySchema>
export const marginPointSchema = marginSummarySchema.extend({ bucketStartDate: isoDate })
export type MarginPoint = z.infer<typeof marginPointSchema>

export const marginOrderSchema = z.object({
  orderId: z.string(),
  orderCode: z.string(),
  completedAt: z.string(),
  serviceType: z.string(),
  sourceChannel: z.string(),
  subtotalAmount: amount,
  discountAmount: amount,
  taxAmount: amount,
  serviceChargeAmount: amount,
  salesAmount: amount,
  netSalesAmount: amount,
  eligibleItemCount: count,
  fullyCostedItemCount: count,
  costCoverageStatus: z.string(),
  costIssues: z.array(costIssueSchema),
  referenceCostAmount: amount.nullable(),
  referenceMarginAmount: amount.nullable(),
  referenceMarginPercent: percent,
})
export type MarginOrder = z.infer<typeof marginOrderSchema>

export const dailyResponseSchema = envelope(overviewDataSchema)
export const seriesResponseSchema = envelope(z.array(seriesPointSchema))
export const paymentMethodsResponseSchema = envelope(z.array(paymentMethodRowSchema))
export const topItemsResponseSchema = envelope(pageSchema(topItemSchema))
export const reportOrdersResponseSchema = envelope(pageSchema(reportOrderSchema))
export const marginSummaryResponseSchema = envelope(marginSummarySchema)
export const marginSeriesResponseSchema = envelope(z.array(marginPointSchema))
export const marginOrdersResponseSchema = envelope(pageSchema(marginOrderSchema))

// ── URL criteria ─────────────────────────────────────────────────────────────

const serviceTypeFilter = z.enum(['', 'DINE_IN', 'TAKEAWAY'])
const channelFilter = z.enum(['', 'CASHIER', 'WAITER', 'QR_STATIC', 'QR_TABLE'])

/** Filters shared by every range report (kept in the URL). */
export const rangeCriteriaSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceType: serviceTypeFilter,
  sourceChannel: channelFilter,
  granularity: z.enum(['', 'DAY', 'MONTH']),
})
export type RangeCriteria = z.infer<typeof rangeCriteriaSchema>

export const topItemsCriteriaSchema = z.object({
  tpage: z.number().int().min(0),
  tsortBy: z.enum(['quantity', 'itemSalesAmount']),
  tdirection: z.enum(['asc', 'desc']),
})
export type TopItemsCriteria = z.infer<typeof topItemsCriteriaSchema>
export const topItemsDefaults: TopItemsCriteria = { tpage: 0, tsortBy: 'quantity', tdirection: 'desc' }

export const reportOrdersCriteriaSchema = z.object({
  opage: z.number().int().min(0),
  dateBasis: z.enum(['CREATED', 'COMPLETED', 'CANCELLED', 'PAID']),
  ostatus: z.enum(['', 'OPEN', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED']),
  opayment: z.enum(['', 'UNPAID', 'PAID', 'PARTIALLY_PAID']),
  osortBy: z.enum(['reportEventAt', 'totalAmount']),
  odirection: z.enum(['asc', 'desc']),
})
export type ReportOrdersCriteria = z.infer<typeof reportOrdersCriteriaSchema>
export const reportOrdersDefaults: ReportOrdersCriteria = {
  opage: 0,
  dateBasis: 'CREATED',
  ostatus: '',
  opayment: '',
  osortBy: 'reportEventAt',
  odirection: 'desc',
}

export const marginOrdersCriteriaSchema = z.object({
  mpage: z.number().int().min(0),
  coverage: z.enum(['ALL', 'COMPLETE', 'EXCLUDED']),
  msortBy: z.enum(['completedAt', 'netSalesAmount', 'referenceCostAmount', 'referenceMarginAmount']),
  mdirection: z.enum(['asc', 'desc']),
})
export type MarginOrdersCriteria = z.infer<typeof marginOrdersCriteriaSchema>
export const marginOrdersDefaults: MarginOrdersCriteria = { mpage: 0, coverage: 'ALL', msortBy: 'completedAt', mdirection: 'desc' }
