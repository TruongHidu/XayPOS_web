import type { QueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../auth/store/authStore'
import { paymentsApi } from '../../payment/api/paymentsApi'
import type { Payment } from '../../payment/schemas'
import { canOrder, canViewPayment, orderScope } from '../policies/orderAccessPolicy'
import { ordersApi } from '../api/ordersApi'
import { cacheOrderSnapshot } from '../api/orderSnapshot'
import {
  buildReceiptDocument,
  isReceiptPaymentValid,
  receiptKindForOrder,
  type ReceiptKind,
  type ReceiptTender,
} from './receiptModel'

export interface ReceiptRequest {
  orderId: string
  reprint?: boolean
  expectedKind?: ReceiptKind
  expectedVersion?: number
  payment?: Payment
  tender?: ReceiptTender
}
export async function loadReceipt(
  client: QueryClient,
  scope: string,
  revision: number,
  request: ReceiptRequest,
  signal: AbortSignal,
) {
  const requireCurrent = () => {
    const auth = useAuthStore.getState()
    if (
      signal.aborted ||
      auth.sessionRevision !== revision ||
      orderScope(auth) !== scope ||
      !canOrder(auth, 'ORDER_VIEW')
    )
      throw new Error('ORDER_ACCESS_CHANGED')
    return auth
  }
  requireCurrent()
  const incoming = await ordersApi.detail(scope, request.orderId, signal)
  requireCurrent()
  if (incoming.id !== request.orderId.toLowerCase()) throw new Error('RECEIPT_ORDER_INCONSISTENT')
  const order = cacheOrderSnapshot(client, scope, incoming)
  const kind = receiptKindForOrder(order)
  if ((request.reprint || request.payment) && kind !== 'paid') throw new Error('RECEIPT_ORDER_INCONSISTENT')
  let payment: Payment | undefined
  if (kind === 'paid') {
    if (request.payment && !request.reprint) {
      if (!isReceiptPaymentValid(order, request.payment)) throw new Error('RECEIPT_PAYMENT_INVALID')
      payment = request.payment
    } else if (canViewPayment(requireCurrent())) {
      // The contract permits exactly one successful full payment, not split payment.
      // Search pages rather than choosing the newest or first failed/pending row.
      let page = 0
      let totalPages = 1
      while (page < totalPages) {
        if (page >= 50) throw new Error('RECEIPT_PAYMENT_INVALID')
        const result = await paymentsApi.list(scope, order.id, { page, size: 100 }, signal)
        requireCurrent()
        if (result.page !== page) throw new Error('RECEIPT_PAYMENT_INVALID')
        totalPages = result.totalPages
        const successful = result.content.filter((value) => value.status === 'SUCCESS')
        if (successful.length > 1 || successful.some((value) => !isReceiptPaymentValid(order, value)))
          throw new Error('RECEIPT_PAYMENT_INVALID')
        if (successful.length === 1) {
          if (payment) throw new Error('RECEIPT_PAYMENT_INVALID')
          payment = successful[0]
        }
        page++
      }
      if (!payment) throw new Error('RECEIPT_PAYMENT_INVALID')
    }
  }
  const auth = requireCurrent()
  return buildReceiptDocument({
    order,
    kind,
    reprint: request.reprint,
    payment,
    tender: request.reprint ? undefined : request.tender,
    restaurant: { name: auth.user?.restaurantName ?? '', code: auth.user?.restaurantCode },
    printedAt: new Date().toISOString(),
  })
}
