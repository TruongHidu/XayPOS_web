import { z } from 'zod'
import { moneySchema, pageSchema, resourceId, timestampSchema, versionSchema } from '../../shared/api/tenantSchemas'

export const paymentInputSchema = z
  .object({
    expectedOrderVersion: versionSchema,
    paymentMethod: z.enum(['CASH', 'TRANSFER']),
    amount: moneySchema.refine((value) => value > 0, 'Số tiền phải lớn hơn 0.'),
    referenceNo: z.string().trim().optional(),
  })
  .strict()
  .refine((value) => value.paymentMethod !== 'TRANSFER' || !!value.referenceNo, {
    path: ['referenceNo'],
    message: 'Chuyển khoản cần mã giao dịch đã đối soát.',
  })
export const paymentSchema = z.object({
  id: resourceId,
  orderId: resourceId,
  paymentCode: z.string().min(1),
  amount: moneySchema,
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  paymentMethod: z.enum(['CASH', 'TRANSFER']),
  confirmationSource: z.enum(['STAFF_MANUAL', 'PROVIDER_WEBHOOK']),
  provider: z.string().nullable(),
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED']),
  referenceNo: z.string().nullable(),
  requestedAt: timestampSchema,
  paidAt: timestampSchema.nullable(),
  createdBy: resourceId.nullable(),
})
export const paymentPageSchema = pageSchema(paymentSchema)
export const paymentCriteriaSchema = z
  .object({
    page: versionSchema.max(2147483647).default(0),
    size: z.number().int().min(1).max(100).default(20),
  })
  .strict()
export type PaymentInput = z.infer<typeof paymentInputSchema>
export type Payment = z.infer<typeof paymentSchema>
