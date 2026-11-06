import type { Order, OrderLine } from '../types'
import { orderSchema } from '../schemas'
import { paymentSchema, type Payment } from '../../payment/schemas'
import { moneyMinor } from '../../../shared/utils/scaledDecimal'

export type ReceiptKind = 'provisional' | 'paid'
export interface ReceiptRestaurant {
  name: string
  code?: string | null
}
export interface ReceiptTender {
  cashGiven: bigint
  change: bigint
}
type ReceiptLine = Readonly<
  Pick<OrderLine, 'id' | 'itemId' | 'itemName' | 'quantity' | 'unit' | 'unitPrice' | 'lineTotal' | 'note'>
>
export interface ReceiptOrderSnapshot {
  readonly id: string
  readonly version: number
  readonly orderCode: string
  readonly status: Order['status']
  readonly paymentStatus: Order['paymentStatus']
  readonly serviceType: Order['serviceType']
  readonly customerName: string | null
  readonly note: string | null
  readonly currencyCode: string
  readonly createdAt: string
  readonly subtotalAmount: number
  readonly discountAmount: number
  readonly taxAmount: number
  readonly serviceChargeAmount: number
  readonly totalAmount: number
  readonly paidAmount: number
  readonly items: readonly ReceiptLine[]
}
export interface ReceiptDocument {
  readonly kind: ReceiptKind
  readonly reprint: boolean
  readonly order: ReceiptOrderSnapshot
  readonly payment?: Readonly<Payment>
  readonly restaurant: Readonly<ReceiptRestaurant>
  readonly printedAt: string
  readonly tender?: Readonly<ReceiptTender>
}
export interface BuildReceiptInput {
  order: Order
  kind?: ReceiptKind
  reprint?: boolean
  payment?: Payment | null
  restaurant: ReceiptRestaurant
  printedAt: string
  tender?: ReceiptTender
}
const servingStatuses: Order['status'][] = ['CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED']
const provisionalStatuses: Order['status'][] = ['OPEN', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED']
const messages: Record<string, string> = {
  RECEIPT_ORDER_CANCELLED: 'Đơn đã bị hủy, không thể in bill phải thu.',
  RECEIPT_PAYMENT_UNSUPPORTED: 'Trạng thái thanh toán này chưa hỗ trợ in bill. Vui lòng kiểm tra lại đơn.',
  RECEIPT_ORDER_INCONSISTENT: 'Số tiền hoặc trạng thái đơn chưa nhất quán. Tải lại đơn để kiểm tra trước khi in.',
  RECEIPT_KIND_CHANGED: 'Loại bill đã thay đổi theo trạng thái đơn. Đọc lại nội dung trước khi in.',
  RECEIPT_PAYMENT_INVALID: 'Giao dịch chưa thành công hoặc không khớp với đơn. Kiểm tra lại thanh toán trước khi in.',
  RECEIPT_TENDER_INVALID: 'Tiền khách đưa hoặc tiền thừa chưa khớp với giao dịch đã chốt.',
  RECEIPT_RESTAURANT_MISSING: 'Chưa có tên nhà hàng hợp lệ để chuẩn bị bill.',
  RECEIPT_TIME_INVALID: 'Thời điểm in bill chưa hợp lệ. Vui lòng thử lại.',
}
export function receiptKindForOrder(order: Order): ReceiptKind {
  if (order.status === 'CANCELLED') throw new Error('RECEIPT_ORDER_CANCELLED')
  const total = moneyMinor(order.totalAmount)
  const paid = moneyMinor(order.paidAmount)
  if (order.paymentStatus === 'PAID') {
    if (total <= 0n || paid !== total || !servingStatuses.includes(order.status))
      throw new Error('RECEIPT_ORDER_INCONSISTENT')
    return 'paid'
  }
  if (order.paymentStatus !== 'UNPAID') throw new Error('RECEIPT_PAYMENT_UNSUPPORTED')
  if (paid !== 0n || !provisionalStatuses.includes(order.status)) throw new Error('RECEIPT_ORDER_INCONSISTENT')
  return 'provisional'
}
export function isReceiptPaymentValid(order: Order, payment: Payment): boolean {
  return (
    payment.status === 'SUCCESS' &&
    payment.orderId === order.id &&
    payment.currencyCode === order.currencyCode &&
    moneyMinor(payment.amount) === moneyMinor(order.totalAmount) &&
    moneyMinor(payment.amount) > 0n &&
    payment.paidAt !== null &&
    Number.isFinite(Date.parse(payment.paidAt))
  )
}
export function receiptErrorMessage(error: unknown): string {
  return error instanceof Error && messages[error.message]
    ? messages[error.message]
    : 'Chưa thể chuẩn bị bill. Vui lòng tải lại dữ liệu và thử lại.'
}
/** Copies only printable fields. Live cache/store changes cannot change an open print dialog. */
export function buildReceiptDocument(input: BuildReceiptInput): ReceiptDocument {
  const order = orderSchema.parse(input.order)
  const kind = receiptKindForOrder(order)
  if (input.kind && input.kind !== kind) throw new Error('RECEIPT_KIND_CHANGED')
  if (!Number.isFinite(Date.parse(input.printedAt))) throw new Error('RECEIPT_TIME_INVALID')
  if (!input.restaurant.name.trim()) throw new Error('RECEIPT_RESTAURANT_MISSING')
  const payment = input.payment ? paymentSchema.parse(input.payment) : undefined
  if (payment && (kind !== 'paid' || !isReceiptPaymentValid(order, payment))) throw new Error('RECEIPT_PAYMENT_INVALID')
  let tender: ReceiptTender | undefined
  if (input.tender && !input.reprint) {
    const total = moneyMinor(order.totalAmount)
    if (
      kind !== 'paid' ||
      !payment ||
      payment.paymentMethod !== 'CASH' ||
      input.tender.cashGiven < total ||
      input.tender.change < 0n ||
      input.tender.cashGiven - total !== input.tender.change
    )
      throw new Error('RECEIPT_TENDER_INVALID')
    tender = Object.freeze({ cashGiven: input.tender.cashGiven, change: input.tender.change })
  }
  const snapshot: ReceiptOrderSnapshot = Object.freeze({
    id: order.id,
    version: order.version,
    orderCode: order.orderCode,
    status: order.status,
    paymentStatus: order.paymentStatus,
    serviceType: order.serviceType,
    customerName: order.customerName,
    note: order.note,
    currencyCode: order.currencyCode,
    createdAt: order.createdAt,
    subtotalAmount: order.subtotalAmount,
    discountAmount: order.discountAmount,
    taxAmount: order.taxAmount,
    serviceChargeAmount: order.serviceChargeAmount,
    totalAmount: order.totalAmount,
    paidAmount: order.paidAmount,
    items: Object.freeze(
      order.items
        .filter((line) => line.status !== 'CANCELLED')
        .map((line) =>
          Object.freeze({
            id: line.id,
            itemId: line.itemId,
            itemName: line.itemName,
            quantity: line.quantity,
            unit: line.unit,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            note: line.note,
          }),
        ),
    ),
  })
  return Object.freeze({
    kind,
    reprint: input.reprint ?? false,
    order: snapshot,
    payment: payment ? Object.freeze({ ...payment }) : undefined,
    restaurant: Object.freeze({ name: input.restaurant.name.trim(), code: input.restaurant.code?.trim() || undefined }),
    printedAt: input.printedAt,
    tender,
  })
}
