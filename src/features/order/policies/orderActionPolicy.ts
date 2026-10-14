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
export const completable = (order: Order) =>
  order.status !== 'COMPLETED' &&
  order.status !== 'CANCELLED' &&
  order.paymentStatus === 'PAID' &&
  moneyMinor(order.paidAmount) === moneyMinor(order.totalAmount) &&
  moneyMinor(order.totalAmount) > 0n &&
  order.items.some((i) => i.status !== 'CANCELLED') &&
  order.items.filter((i) => i.status !== 'CANCELLED').every((i) => i.status === 'SERVED')
