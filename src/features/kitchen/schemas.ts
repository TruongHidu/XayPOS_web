import { z } from 'zod'
import { pageSchema, quantitySchema, resourceId, timestampSchema, versionSchema } from '../../shared/api/tenantSchemas'
import { serviceTypeSchema } from '../order/schemas'

export const kitchenStatusSchema = z.enum(['PENDING', 'COOKING', 'READY'])
export const kitchenItemSchema = z.object({
  orderId: resourceId,
  orderCode: z.string().min(1),
  orderVersion: versionSchema,
  orderItemId: resourceId,
  itemName: z.string().min(1),
  quantity: quantitySchema,
  unit: z.string().min(1),
  note: z.string().nullable(),
  itemStatus: kitchenStatusSchema,
  serviceType: serviceTypeSchema,
  createdAt: timestampSchema,
  sentToKitchenAt: timestampSchema.nullable(),
  sessionId: resourceId.nullable(),
  tableId: resourceId.nullable(),
  tableCode: z.string().nullable(),
  tableName: z.string().nullable(),
})
export const kitchenPageSchema = pageSchema(kitchenItemSchema)
export const kitchenCriteriaSchema = z
  .object({
    status: kitchenStatusSchema.default('PENDING'),
    page: versionSchema.default(0),
    size: z.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine((v) => v.page <= Math.floor(2147483647 / v.size), 'Page vượt giới hạn.')
export type KitchenItem = z.infer<typeof kitchenItemSchema>
