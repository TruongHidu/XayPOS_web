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

export const serviceTypeSchema = z.enum(['DINE_IN', 'TAKEAWAY'])
export const submissionModeSchema = z.enum(['DRAFT', 'SUBMIT'])
export const orderStatusSchema = z.enum(['OPEN', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED'])
export const paymentStatusSchema = z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'])
export const orderLineSchema = z
  .object({
    id: resourceId,
    itemId: resourceId.nullable(),
    itemName: z.string().min(1),
    unit: z.string().min(1),
    quantity: quantitySchema,
    unitPrice: moneySchema,
    discountAmount: moneySchema,
    lineTotal: moneySchema,
    status: z.enum(['PENDING', 'COOKING', 'READY', 'SERVED', 'CANCELLED']),
    note: z.string().nullable(),
    cancelReason: z.string().nullable(),
    sentToKitchenAt: timestampSchema.nullable(),
    createdAt: timestampSchema.optional(),
  })
  .passthrough()
export const orderSummarySchema = z.object({
  id: resourceId,
  orderCode: z.string().min(1),
  serviceType: serviceTypeSchema,
  sourceChannel: z.enum(['CASHIER', 'WAITER', 'QR_STATIC', 'QR_TABLE']),
  tableSessionId: resourceId.nullable(),
  status: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  customerName: z.string().nullable(),
  guestCount: guestSchema,
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  totalAmount: moneySchema,
  paidAmount: moneySchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  version: versionSchema,
})
export const orderSchema = orderSummarySchema.extend({
  customerPhone: z.string().nullable(),
  note: z.string().nullable(),
  subtotalAmount: moneySchema,
  discountAmount: moneySchema,
  taxAmount: moneySchema,
  serviceChargeAmount: moneySchema,
  createdBy: resourceId.nullable(),
  confirmedAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  cancelledAt: timestampSchema.nullable(),
  cancelReason: z.string().nullable(),
  items: z.array(orderLineSchema),
})
export const orderPageSchema = pageSchema(orderSummarySchema)
export const createLineSchema = z
  .object({
    itemId: resourceId,
    quantity: quantitySchema,
    note: z.string().max(2000).nullable().optional(),
  })
  .strict()
const customerFields = {
  guestCount: guestSchema.optional(),
  customerName: z.string().max(100).optional(),
  customerPhone: z.string().max(30).optional(),
  note: z.string().max(2000).optional(),
}
export const createOrderSchema = z
  .object({
    serviceType: serviceTypeSchema,
    sourceChannel: z.enum(['CASHIER', 'WAITER']),
    tableId: resourceId.optional(),
    tableSessionId: resourceId.nullable().optional(),
    submissionMode: submissionModeSchema.optional(),
    ...customerFields,
    items: z.array(createLineSchema).min(1).max(100),
  })
  .strict()
  .superRefine((v, ctx) => {
    const table = !!v.tableId
    const session = !!v.tableSessionId
    if (v.serviceType === 'TAKEAWAY' && (table || session))
      ctx.addIssue({ code: 'custom', message: 'Đơn mang đi không được có bàn hoặc phiên bàn.' })
    if (v.serviceType === 'DINE_IN' && table === session)
      ctx.addIssue({ code: 'custom', message: 'Đơn tại bàn cần đúng một bàn hoặc phiên bàn.' })
    if (table && v.submissionMode !== 'SUBMIT')
      ctx.addIssue({ code: 'custom', path: ['submissionMode'], message: 'Tạo đơn từ bàn phải dùng SUBMIT.' })
  })
export const updateOrderSchema = z
  .object({ expectedVersion: versionSchema, ...customerFields })
  .strict()
  .refine(
    (v) => Object.keys(v).some((k) => k !== 'expectedVersion' && v[k as keyof typeof v] !== undefined),
    'Chưa có thay đổi.',
  )
export const addItemsSchema = z
  .object({
    expectedVersion: versionSchema,
    submissionMode: submissionModeSchema.optional(),
    items: z.array(createLineSchema).min(1).max(100),
  })
  .strict()
export const updateLineSchema = z
  .object({
    expectedVersion: versionSchema,
    quantity: quantitySchema.optional(),
    note: z.string().max(2000).optional(),
  })
  .strict()
  .refine((v) => v.quantity !== undefined || v.note !== undefined, 'Chưa có thay đổi.')
export const cancelSchema = z
  .object({
    expectedVersion: versionSchema,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict()
export const versionRequestSchema = z.object({ expectedVersion: versionSchema }).strict()
export const itemTransitionSchema = z.object({ expectedOrderVersion: versionSchema }).strict()
export const orderCriteriaSchema = z
  .object({
    q: z.string().trim().max(100).default(''),
    status: orderStatusSchema.optional(),
    serviceType: serviceTypeSchema.optional(),
    tableSessionId: resourceId.optional(),
    page: versionSchema.default(0),
    size: z.number().int().min(1).max(100).default(20),
    sortBy: z.enum(['createdAt', 'updatedAt', 'orderCode', 'totalAmount']).default('createdAt'),
    direction: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine((v) => v.page <= Math.floor(2147483647 / v.size), 'Page vượt giới hạn.')
