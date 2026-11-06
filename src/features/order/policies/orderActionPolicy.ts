import type { Order, OrderLine } from '../types'
import { moneyMinor } from '../../../shared/utils/scaledDecimal'
export const unpaid = (order: Order) => order.paymentStatus === 'UNPAID' && moneyMinor(order.paidAmount) === 0n
export const editable = (order: Order) => order.status === 'OPEN' && unpaid(order)
export const appendable = (order: Order) =>
  ['OPEN', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'].includes(order.status) && unpaid(order)
export const confirmable = (order: Order) => editable(order) && order.items.some((i) => i.status !== 'CANCELLED')
export const cancellable = (order: Order) =>
  ['OPEN', 'CONFIRMED'].includes(order.status) &&
  unpaid(order) &&
  order.items.every((i) => ['PENDING', 'CANCELLED'].includes(i.status))
export const lineCancelPermission = (order: Order) => (order.confirmedAt === null ? 'ORDER_UPDATE' : 'ORDER_CANCEL')
export const lineCancellable = (order: Order, line: OrderLine) => appendable(order) && line.status === 'PENDING'
export const payable = (order: Order) =>
  ['CONFIRMED', 'PREPARING', 'READY', 'SERVED'].includes(order.status) &&
  unpaid(order) &&
  moneyMinor(order.totalAmount) > 0n
export const isServingOrder = (order: Order) =>
  ['CONFIRMED', 'PREPARING', 'READY', 'SERVED'].includes(order.status)

export const liveItems = (order: Order) =>
  order.items.filter((i) => i.status !== 'CANCELLED')

export const markAllReadyAllowed = (order: Order) => {
  if (!isServingOrder(order)) return false
  const active = liveItems(order)
  if (active.length === 0) return false
  const hasCooking = active.some((i) => i.status === 'COOKING')
  const hasPending = active.some((i) => i.status === 'PENDING')
  return hasCooking && !hasPending
}

export const markAllServedAllowed = (order: Order) => {
  if (!isServingOrder(order)) return false
  const active = liveItems(order)
  if (active.length === 0) return false
  return active.some((i) => i.status === 'PENDING' || i.status === 'COOKING' || i.status === 'READY')
}

export const allLiveItemsServed = (order: Order) => {
  const active = liveItems(order)
  return active.length > 0 && active.every((i) => i.status === 'SERVED')
}

export const completable = (order: Order) =>
  isServingOrder(order) &&
  order.paymentStatus === 'PAID' &&
  moneyMinor(order.paidAmount) === moneyMinor(order.totalAmount) &&
  moneyMinor(order.totalAmount) > 0n &&
  liveItems(order).length > 0 &&
  liveItems(order).every((i) => i.status === 'SERVED')
