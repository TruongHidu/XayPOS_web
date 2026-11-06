import { z } from 'zod'

const id = z.string().uuid()
const context = id.nullable()
const envelope = z.object({
  eventId: id,
  schemaVersion: z.literal(1),
  resourceId: id,
  resourceVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  occurredAt: z.iso.datetime({ offset: true }),
})
export const orderEventSchema = envelope.extend({
  type: z.literal('ORDER_CHANGED'),
  resourceType: z.literal('ORDER'),
  payload: z.object({
    orderStatus: z.enum(['OPEN', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED']),
    tableSessionId: context,
    changes: z
      .array(
        z.enum([
          'CREATED',
          'UPDATED',
          'SUBMITTED',
          'ITEMS_ADDED',
          'ITEM_UPDATED',
          'ITEM_CANCELLED',
          'ITEM_STATUS_CHANGED',
          'CANCELLED',
          'COMPLETED',
        ]),
      )
      .min(1)
      .max(9),
    changedOrderItemIds: z.array(id).max(1000),
    newKitchenItemIds: z.array(id).max(1000),
  }),
})
export const qrEventSchema = envelope.extend({
  type: z.literal('QR_ORDER_REQUEST_CHANGED'),
  resourceType: z.literal('QR_ORDER_REQUEST'),
  payload: z.object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']),
    changeKind: z.enum(['CREATED', 'APPROVED', 'REJECTED', 'CANCELLED']),
    entryType: z.enum(['TABLE', 'RESTAURANT']),
    tableId: context,
    observedSessionId: context,
    approvedOrderId: context,
    approvedSessionId: context,
  }),
})
const schema = z.discriminatedUnion('type', [orderEventSchema, qrEventSchema])
export type RealtimeEvent = z.infer<typeof schema>
export type OrderEvent = z.infer<typeof orderEventSchema>
export type QrEvent = z.infer<typeof qrEventSchema>
export function parseRealtimeEvent(body: string): RealtimeEvent | null {
  if (body.length > 65536) return null
  try {
    const result = schema.safeParse(JSON.parse(body))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
