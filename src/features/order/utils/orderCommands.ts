import type { Order, OrderLine } from '../types'
import type { OrderCommand } from '../hooks/useOrderMutations'
import { quantityMilli } from '../../../shared/utils/scaledDecimal'
export type EditorKind = 'metadata' | 'line' | 'confirm' | 'cancel' | 'cancelLine'
export interface EditorFields {
  customerName: string
  customerPhone: string
  guestCount: string
  note: string
  quantity: string
  reason: string
}
export function editorDefaults(order: Order, line?: OrderLine): EditorFields {
  return {
    customerName: order.customerName ?? '',
    customerPhone: order.customerPhone ?? '',
    guestCount: String(order.guestCount),
    note: line ? (line.note ?? '') : (order.note ?? ''),
    quantity: line ? String(line.quantity) : '1',
    reason: '',
  }
}
export function buildOrderCommand(
  kind: EditorKind,
  order: Order,
  fields: EditorFields,
  line?: OrderLine,
): OrderCommand {
  const expectedVersion = order.version
  if (kind === 'confirm') return { kind, input: { expectedVersion } }
  if (kind === 'cancel') return { kind, input: { expectedVersion, reason: fields.reason } }
  if (kind === 'cancelLine') return { kind, lineId: line!.id, input: { expectedVersion, reason: fields.reason } }
  if (kind === 'line') {
    const quantity = quantityMilli(fields.quantity)
    return {
      kind,
      lineId: line!.id,
      input: {
        expectedVersion,
        ...(quantity !== quantityMilli(line!.quantity) ? { quantity: Number(fields.quantity) } : {}),
        ...(fields.note !== (line!.note ?? '') ? { note: fields.note } : {}),
      },
    }
  }
  if (!/^\d+$/.test(fields.guestCount)) throw new Error('INVALID_GUEST_COUNT')
  return {
    kind: 'update',
    input: {
      expectedVersion,
      ...(fields.customerName !== (order.customerName ?? '') ? { customerName: fields.customerName } : {}),
      ...(fields.customerPhone !== (order.customerPhone ?? '') ? { customerPhone: fields.customerPhone } : {}),
      ...(Number(fields.guestCount) !== order.guestCount ? { guestCount: Number(fields.guestCount) } : {}),
      ...(fields.note !== (order.note ?? '') ? { note: fields.note } : {}),
    },
  }
}
