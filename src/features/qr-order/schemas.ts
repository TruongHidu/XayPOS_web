import { z } from 'zod'
import { moneySchema, resourceId, timestampSchema, versionSchema } from '../../shared/api/tenantSchemas'
import { quantityMilli } from '../../shared/utils/scaledDecimal'

export const entryTypeSchema = z.enum(['TABLE', 'RESTAURANT'])
export const publicEntrySchema = z
  .object({ entryType: entryTypeSchema, token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict()
export const qrKeySchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/)
const guestTokenSchema = z
  .string()
  .min(1)
  .refine((value) => !/\s/.test(value))
export const qrQuantitySchema = z
  .number()
  .finite()
  .min(0.001)
  .max(20)
  .refine((value) => {
    try {
      quantityMilli(value)
      return true
    } catch {
      return false
    }
  }, 'Số lượng từ 0,001 đến 20, tối đa 3 chữ số thập phân.')
const noteSchema = z.string().max(500).nullable().optional()
export const qrRequestInputSchema = z
  .object({
    customerName: z.string().trim().max(100).nullable().optional(),
    customerPhone: z.string().trim().max(30).nullable().optional(),
    note: noteSchema,
    items: z
      .array(z.object({ itemId: resourceId, quantity: qrQuantitySchema, note: noteSchema }).strict())
      .min(1)
      .max(20),
  })
  .strict()
const mapping = {
  entryType: entryTypeSchema,
  serviceType: z.enum(['DINE_IN', 'TAKEAWAY']),
  sourceChannel: z.enum(['QR_TABLE', 'QR_STATIC']),
}
const validMapping = (value: { entryType: string; serviceType: string; sourceChannel: string }) =>
  value.entryType === 'TABLE'
    ? value.serviceType === 'DINE_IN' && value.sourceChannel === 'QR_TABLE'
    : value.serviceType === 'TAKEAWAY' && value.sourceChannel === 'QR_STATIC'
export const guestAccessSchema = z
  .object({
    guestToken: guestTokenSchema,
    expiresAt: timestampSchema,
    ...mapping,
    restaurant: z.object({ id: resourceId, name: z.string().min(1), currencyCode: z.string().regex(/^[A-Z]{3}$/) }),
    table: z.object({ id: resourceId, code: z.string(), name: z.string() }).nullable(),
  })
  .refine((value) => validMapping(value) && (value.entryType === 'TABLE' ? value.table !== null : value.table === null))
export const qrReceiptSchema = z
  .object({
    requestId: resourceId,
    ...mapping,
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']),
    version: versionSchema,
    expired: z.boolean(),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    estimatedAmount: moneySchema,
    approvedAmount: moneySchema.nullable(),
    approvedOrderCode: z.string().nullable(),
    createdAt: timestampSchema,
    expiresAt: timestampSchema,
    items: z
      .array(
        z.object({
          requestItemId: resourceId,
          itemId: resourceId,
          itemName: z.string().min(1),
          unit: z.string(),
          quantity: qrQuantitySchema,
          estimatedUnitPrice: moneySchema,
          estimatedLineTotal: moneySchema,
          note: z.string().nullable(),
          approvedOrderItemId: resourceId.nullable(),
          approvedUnitPrice: moneySchema.nullable(),
          approvedLineTotal: moneySchema.nullable(),
          status: z.enum(['PENDING', 'COOKING', 'READY', 'SERVED', 'CANCELLED']).nullable(),
        }),
      )
      .min(1)
      .max(20),
  })
  .refine(validMapping)
export { guestTokenSchema }
