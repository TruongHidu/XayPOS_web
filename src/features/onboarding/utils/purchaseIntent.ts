import { newOrderId } from '../../order/utils/orderId'

export interface PurchaseIntent {
  key: string
  packageCode: string
}

export interface PurchaseIntentScope {
  restaurantId: string
  userId: string
}

const purchaseStorageKey = ({ restaurantId, userId }: PurchaseIntentScope) => `pos.purchaseIntent:${restaurantId}:${userId}`
const attemptStorageKey = ({ restaurantId, userId }: PurchaseIntentScope, purchaseId: string) =>
  `pos.attemptIntent:${restaurantId}:${userId}:${purchaseId}`

function readJson(storageKey: string): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
  } catch {
    return null
  }
}

function writeJson(storageKey: string, value: unknown) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // Without storage the key still protects retries from this click.
  }
}

function remove(storageKey: string) {
  try {
    sessionStorage.removeItem(storageKey)
  } catch {
    // ignore
  }
}

/** Same package keeps the key, so a retry after a timeout replays instead of creating a second purchase. */
export function purchaseIntentFor(scope: PurchaseIntentScope, packageCode: string): PurchaseIntent {
  const value = readJson(purchaseStorageKey(scope)) as Partial<PurchaseIntent> | null
  if (typeof value?.key === 'string' && value.packageCode === packageCode) return { key: value.key, packageCode }
  const intent = { key: `purchase-${newOrderId()}`, packageCode }
  writeJson(purchaseStorageKey(scope), intent)
  return intent
}

export function clearPurchaseIntent(scope: PurchaseIntentScope) {
  remove(purchaseStorageKey(scope))
}

/** One payment attempt intent per purchase; kept until the server gives a definite answer. */
export function attemptKeyFor(scope: PurchaseIntentScope, purchaseId: string): string {
  const value = readJson(attemptStorageKey(scope, purchaseId))
  if (typeof value === 'string') return value
  const key = `attempt-${newOrderId()}`
  writeJson(attemptStorageKey(scope, purchaseId), key)
  return key
}

export function clearAttemptKey(scope: PurchaseIntentScope, purchaseId: string) {
  remove(attemptStorageKey(scope, purchaseId))
}
