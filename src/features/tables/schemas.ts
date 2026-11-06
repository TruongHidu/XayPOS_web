import { z } from 'zod'
import { guestSchema, pageSchema, resourceId, timestampSchema, versionSchema } from '../../shared/api/tenantSchemas'
export const areaSchema = z.object({
  id: resourceId,
  name: z.string().min(1),
  description: z.string().nullable(),
  active: z.boolean(),
  displayOrder: versionSchema,
  version: versionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export const tableSchema = z.object({
  id: resourceId,
  code: z.string(),
  name: z.string().min(1),
  capacity: guestSchema,
  displayOrder: versionSchema,
  status: z.enum(['AVAILABLE', 'INACTIVE']),
  area: z.object({ id: resourceId, name: z.string(), active: z.boolean() }).nullable(),
  occupied: z.boolean(),
  canOpen: z.boolean(),
  version: versionSchema,
  currentSession: z
    .object({
      id: resourceId,
      sessionCode: z.string(),
      guestCount: guestSchema,
      openedAt: timestampSchema,
      version: versionSchema,
    })
    .nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export const sessionSchema = z.object({
  id: resourceId,
  sessionCode: z.string(),
  tableId: resourceId,
  tableCode: z.string(),
  tableName: z.string(),
  status: z.enum(['OPEN', 'CLOSED', 'CANCELLED']),
  guestCount: guestSchema,
  note: z.string().nullable(),
  openedBy: resourceId.nullable(),
  openedAt: timestampSchema,
  closedBy: resourceId.nullable(),
  closedAt: timestampSchema.nullable(),
  cancelReason: z.string().nullable(),
  version: versionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export const areaPageSchema = pageSchema(areaSchema)
export const tablePageSchema = pageSchema(tableSchema)
export const openSessionSchema = z
  .object({ expectedVersion: versionSchema, guestCount: guestSchema, note: z.string().max(2000).optional() })
  .strict()
export type RestaurantTable = z.infer<typeof tableSchema>
export type TableSession = z.infer<typeof sessionSchema>
