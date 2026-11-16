import { registerTenantErrors } from '../../../shared/errors/tenantErrorMessages'
import type { KitchenItem } from '../schemas'

export type KitchenStatus = KitchenItem['itemStatus']

/** When the line reached the kitchen (old rows without sentToKitchenAt queue by createdAt). */
export const sentAt = (item: KitchenItem) => Date.parse(item.sentToKitchenAt ?? item.createdAt)

/** "Chờ 12 phút" style label. */
export function waitedLabel(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 1) return 'vừa xong'
  if (minutes < 60) return `${minutes} phút`
  return `${Math.floor(minutes / 60)} giờ ${String(minutes % 60).padStart(2, '0')} phút`
}

/** Waiting longer than these minutes turns the ticket orange / red. */
export const WARN_MINUTES = 10
export const LATE_MINUTES = 20
export type Urgency = 'normal' | 'warn' | 'late'
export const urgencyOf = (ms: number): Urgency => (ms >= LATE_MINUTES * 60_000 ? 'late' : ms >= WARN_MINUTES * 60_000 ? 'warn' : 'normal')

export const seatingLabel = (item: Pick<KitchenItem, 'serviceType' | 'tableName' | 'tableCode'>) =>
  item.serviceType === 'TAKEAWAY' ? 'Mang đi' : (item.tableName ?? item.tableCode ?? 'Tại bàn')

export interface KitchenTicket {
  orderId: string
  orderCode: string
  /** Highest version seen for the order (all its lines carry one). */
  orderVersion: number
  seating: string
  serviceType: KitchenItem['serviceType']
  firstSentAt: number
  items: KitchenItem[]
}

const statusRank: Record<KitchenStatus, number> = { COOKING: 0, PENDING: 1, READY: 2 }

/** One ticket per order, oldest first (first-in, first-out); lines cooking first. */
export function groupTickets(items: KitchenItem[], knownVersions: Map<string, number>): KitchenTicket[] {
  const tickets = new Map<string, KitchenTicket>()
  for (const item of items) {
    const ticket = tickets.get(item.orderId)
    if (ticket) {
      ticket.items.push(item)
      ticket.orderVersion = Math.max(ticket.orderVersion, item.orderVersion)
      ticket.firstSentAt = Math.min(ticket.firstSentAt, sentAt(item))
    } else
      tickets.set(item.orderId, {
        orderId: item.orderId,
        orderCode: item.orderCode,
        orderVersion: Math.max(item.orderVersion, knownVersions.get(item.orderId) ?? 0),
        seating: seatingLabel(item),
        serviceType: item.serviceType,
        firstSentAt: sentAt(item),
        items: [item],
      })
  }
  for (const ticket of tickets.values())
    ticket.items.sort((a, b) => statusRank[a.itemStatus] - statusRank[b.itemStatus] || sentAt(a) - sentAt(b))
  return [...tickets.values()].sort((a, b) => a.firstSentAt - b.firstSentAt)
}

export interface DishSummary {
  key: string
  name: string
  unit: string
  pending: number
  cooking: number
  notes: string[]
  oldestSentAt: number
}

/** "Theo món": how many of each dish to cook, merging the same name + unit across orders. */
export function summarizeDishes(items: KitchenItem[]): DishSummary[] {
  const dishes = new Map<string, DishSummary>()
  for (const item of items) {
    if (item.itemStatus === 'READY') continue
    const key = `${item.itemName}\u0000${item.unit}`
    const dish = dishes.get(key) ?? { key, name: item.itemName, unit: item.unit, pending: 0, cooking: 0, notes: [], oldestSentAt: sentAt(item) }
    if (item.itemStatus === 'PENDING') dish.pending += item.quantity
    else dish.cooking += item.quantity
    if (item.note) dish.notes.push(`${seatingLabel(item)}: ${item.note}`)
    dish.oldestSentAt = Math.min(dish.oldestSentAt, sentAt(item))
    dishes.set(key, dish)
  }
  return [...dishes.values()].sort((a, b) => a.oldestSentAt - b.oldestSentAt)
}

export const formatQty = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 3 })

registerTenantErrors({
  INVALID_KITCHEN_RESPONSE: 'Dữ liệu hàng đợi bếp không hợp lệ. Tải lại hàng đợi.',
  INVALID_ORDER_ITEM_TRANSITION: 'Món đã được người khác cập nhật hoặc chưa tới bước này. Tải lại hàng đợi để xem trạng thái mới.',
  CONCURRENT_ORDER_UPDATE: 'Đơn vừa thay đổi (gọi thêm hoặc cập nhật khác). Tải lại hàng đợi rồi thao tác lại.',
  EMPTY_ORDER: 'Đơn không còn món nào cần làm.',
  ORDER_NOT_FOUND: 'Không tìm thấy đơn.',
  INSUFFICIENT_AVAILABLE_STOCK: 'Kho không đủ nguyên liệu. Báo quản lý kiểm tra tồn kho.',
})
