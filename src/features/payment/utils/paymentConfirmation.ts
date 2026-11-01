import type { Payment, PaymentInput } from '../schemas'
import { moneyMinor } from '../../../shared/utils/scaledDecimal'

/** Validate the response against the frozen payment intent, before any success UI. */
export function paymentConfirmsIntent(payment: Payment, orderId: string, currency: string, input: PaymentInput) {
  return (
    payment.status === 'SUCCESS' &&
    payment.orderId === orderId &&
    payment.currencyCode === currency &&
    payment.paymentMethod === input.paymentMethod &&
    moneyMinor(payment.amount) === moneyMinor(input.amount) &&
    payment.paidAt !== null &&
    Number.isFinite(Date.parse(payment.paidAt))
  )
}
