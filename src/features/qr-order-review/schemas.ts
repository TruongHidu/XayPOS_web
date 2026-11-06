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
const quoteLineSchema = z.object({
  itemId: resourceId,
  itemName: z.string(),
  unit: z.string(),
  quantity: quantitySchema,
  unitPrice: moneySchema,
  lineTotal: moneySchema,
  note: z.string().nullable(),
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
  items: z.array(quoteLineSchema.extend({ id: resourceId, approvedOrderItemId: resourceId.nullable() })),
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
  approvedOrderItemIds: z.array(resourceId),
  replay: z.boolean(),
  order: orderSchema,
})
