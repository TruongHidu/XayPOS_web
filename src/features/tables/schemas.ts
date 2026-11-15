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

// ── Table management (areas, tables, QR, sessions) ───────────────────────────

export type TableArea = z.infer<typeof areaSchema>

export const tableQrSchema = z.object({
  tableId: resourceId,
  qrToken: z.string().min(1),
  qrPath: z.string().min(1),
  menuUrl: z.string().nullable().optional(),
  version: versionSchema,
})
export type TableQr = z.infer<typeof tableQrSchema>

export const sessionPageSchema = pageSchema(sessionSchema)
export const transferHistorySchema = pageSchema(
  z.object({
    id: resourceId,
    sessionId: resourceId,
    fromTable: z.object({ id: resourceId, code: z.string(), name: z.string() }),
    toTable: z.object({ id: resourceId, code: z.string(), name: z.string() }),
    actorUserId: resourceId.nullable(),
    reason: z.string().nullable(),
    sessionVersionBefore: versionSchema,
    sessionVersionAfter: versionSchema,
    transferredAt: timestampSchema,
  }),
)
export type TableTransfer = z.infer<typeof transferHistorySchema>['content'][number]

const intIn = (min: number, max: number, label: string) =>
  z.number({ error: `Nhập ${label}.` }).int('Nhập số nguyên.').min(min, `Tối thiểu ${min}.`).max(max, `Tối đa ${max}.`)

export const areaFormSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên khu vực.').max(100, 'Tối đa 100 ký tự.'),
  description: z.string().trim().max(2000, 'Tối đa 2000 ký tự.'),
  displayOrder: intIn(0, 1_000_000, 'thứ tự'),
  active: z.boolean(),
})
export type AreaForm = z.infer<typeof areaFormSchema>

export const tableFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Nhập mã bàn.')
    .max(50, 'Tối đa 50 ký tự.')
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1, 'Nhập tên bàn.').max(100, 'Tối đa 100 ký tự.'),
  areaId: z.string(),
  capacity: intIn(1, 32767, 'số chỗ'),
  displayOrder: intIn(0, 1_000_000, 'thứ tự'),
  active: z.boolean(),
})
export type TableForm = z.input<typeof tableFormSchema>

export const sessionFormSchema = z.object({
  guestCount: intIn(1, 32767, 'số khách'),
  note: z.string().trim().max(2000, 'Tối đa 2000 ký tự.'),
})
export type SessionForm = z.infer<typeof sessionFormSchema>
