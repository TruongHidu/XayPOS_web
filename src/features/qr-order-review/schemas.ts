import { z } from 'zod'
import {
  guestSchema,
  moneySchema,
  pageSchema,
  quantitySchema,
  resourceId,
  timestampSchema,
  versionSchema,
} from '../../shared/api/tenantSchemas'
import { orderSchema, orderStatusSchema, paymentStatusSchema } from '../order/schemas'

export const qrReviewEntrySchema = z.enum(['TABLE', 'RESTAURANT'])
export const qrReviewStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
const baseLineSchema = z.object({
  itemId: resourceId,
  itemName: z.string(),
  unit: z.string(),
  quantity: quantitySchema,
  note: z.string().nullable(),
})
/** What the guest sent (prices as quoted then); a line left out at approval keeps its reason. */
const requestItemSchema = baseLineSchema.extend({
  id: resourceId,
  unitPrice: moneySchema,
  lineTotal: moneySchema,
  approvedOrderItemId: resourceId.nullable(),
  rejectedAt: timestampSchema.nullable().default(null),
  rejectionReason: z.string().nullable().default(null),
})
/**
 * Current quote of one request line. An unavailable line (out of stock, not
 * sellable, gone from the menu) has no price and must be left out on approval.
 * `unavailableReason` stays a string so a new backend code never breaks the review.
 */
export const quoteLineSchema = baseLineSchema
  .extend({
    requestItemId: resourceId,
    available: z.boolean(),
    unavailableReason: z.string().nullable(),
    unitPrice: moneySchema.nullable(),
    lineTotal: moneySchema.nullable(),
  })
  .refine((line) => !line.available || (line.unitPrice !== null && line.lineTotal !== null), {
    message: 'An available quote line needs its current price.',
  })
export const qrReviewSummarySchema = z.object({
  requestId: resourceId,
  entryType: qrReviewEntrySchema,
  serviceType: z.enum(['DINE_IN', 'TAKEAWAY']),
  sourceChannel: z.enum(['QR_TABLE', 'QR_STATIC']),
  status: qrReviewStatusSchema,
  version: versionSchema,
  expired: z.boolean(),
  tableId: resourceId.nullable(),
  observedSessionId: resourceId.nullable(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  note: z.string().nullable(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  estimatedAmount: moneySchema,
  approvedAmount: moneySchema.nullable(),
  approvedOrderId: resourceId.nullable(),
  approvedSessionId: resourceId.nullable(),
  approvedBy: resourceId.nullable(),
  approvedAt: timestampSchema.nullable(),
  rejectedBy: resourceId.nullable(),
  rejectedAt: timestampSchema.nullable(),
  rejectionReason: z.string().nullable(),
  cancelledAt: timestampSchema.nullable(),
  cancellationReason: z.string().nullable(),
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
  items: z.array(requestItemSchema),
})
export const qrReviewDetailSchema = z.object({
  request: qrReviewSummarySchema,
  currentQuote: z.object({ currencyCode: z.string(), amount: moneySchema, lines: z.array(quoteLineSchema) }).nullable(),
  reviewContextHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  canApprove: z.boolean(),
  reasonCode: z.string().nullable(),
  reviewContext: z
    .object({
      currentSessionId: resourceId.nullable(),
      tableAccessEpoch: versionSchema.nullable(),
      sessionVersion: versionSchema.nullable(),
      guestCount: guestSchema.nullable(),
      currentOrder: z
        .object({
          id: resourceId,
          version: versionSchema,
          status: orderStatusSchema,
          paymentStatus: paymentStatusSchema,
          currencyCode: z.string(),
          totalAmount: moneySchema,
          paidAmount: moneySchema,
        })
        .nullable(),
    })
    .nullable(),
})
export const qrReviewCriteriaSchema = z
  .object({
    status: z.literal('PENDING').default('PENDING'),
    entryType: qrReviewEntrySchema.optional(),
    observedSessionId: resourceId.optional(),
    includeExpired: z.literal(false).default(false),
    page: versionSchema.default(0),
    size: z.number().int().min(1).max(100).default(20),
  })
  .strict()
export const qrReviewApproveSchema = z
  .object({
    expectedRequestVersion: versionSchema,
    expectedReviewContextHash: z.string().regex(/^[a-f0-9]{64}$/),
    targetSessionId: resourceId.nullable(),
    /** Lines left out of the order; the guest reads each reason. Absent = approve every line. */
    excludedItems: z
      .array(
        z
          .object({ requestItemId: resourceId, reason: z.string().trim().min(1, 'Nhập lý do bỏ món.').max(500) })
          .strict(),
      )
      .min(1)
      .max(20)
      .optional(),
  })
  .strict()
export const qrReviewRejectSchema = z
  .object({
    expectedRequestVersion: versionSchema,
    reason: z.string().trim().min(1, 'Nhập lý do từ chối.').max(1000),
  })
  .strict()
export const qrReviewPageSchema = pageSchema(qrReviewSummarySchema)
export const qrReviewApprovalSchema = z.object({
  requestId: resourceId,
  status: z.literal('APPROVED'),
  version: versionSchema,
  approvedOrderId: resourceId,
  approvedSessionId: resourceId.nullable(),
  approvedBy: resourceId,
  approvedAt: timestampSchema,
  approvedAmount: moneySchema,
  /** Accepted lines only: never pair it with `items[]` by position. */
  approvedOrderItemIds: z.array(resourceId),
  replay: z.boolean(),
  order: orderSchema,
})
