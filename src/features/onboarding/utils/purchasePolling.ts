import type { PurchaseView } from '../schemas'

const POLL_MS = 4_000
const ERROR_POLL_MS = 15_000

/** Polls only while money may arrive: an open QR, or a paid purchase waiting for activation. */
export function purchasePollDelay(purchase: PurchaseView | undefined, attemptPending: boolean, lastFetchFailed: boolean): number | false {
  if (!purchase) return false
  const waiting = (purchase.displayStatus === 'PENDING_PAYMENT' && attemptPending) || purchase.displayStatus === 'PAID'
  if (!waiting) return false
  return lastFetchFailed ? ERROR_POLL_MS : POLL_MS
}
