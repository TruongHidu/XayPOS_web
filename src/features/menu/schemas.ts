import { z } from 'zod'
import { moneySchema, pageSchema, resourceId, timestampSchema, versionSchema } from '../../shared/api/tenantSchemas'
export const menuGroupSchema = z.object({
  id: resourceId,
  name: z.string().min(1),
  active: z.boolean(),
  displayOrder: versionSchema,
  version: versionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export const privateMenuItemSchema = z.object({
  id: resourceId,
  name: z.string().min(1),
  baseUnit: z.string().min(1),
  salePrice: moneySchema,
  active: z.boolean(),
  sellable: z.boolean(),
  availabilityStatus: z.enum(['AVAILABLE', 'OUT_OF_STOCK']),
  group: z.object({ id: resourceId, name: z.string(), active: z.boolean() }).nullable(),
  imageUrl: z.string().nullable(),
  description: z.string().nullable(),
  sku: z.string().nullable(),
  version: versionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export const privateMenuPageSchema = pageSchema(privateMenuItemSchema)
export const menuGroupPageSchema = pageSchema(menuGroupSchema)
export type PrivateMenuItem = z.infer<typeof privateMenuItemSchema>
