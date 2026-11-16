import type { InventoryAlertEvent } from '../../../shared/realtime/events'
import type { QueryInvalidator } from '../../../shared/realtime/queryInvalidator'
import { toast } from '../../../shared/ui/toast'
import { inventoryKeys } from '../api/inventoryApi'

/**
 * Alert events only say "read again": refresh alerts, low-stock and balances.
 * There is no replay, so a reconnect resyncs the whole inventory module.
 */
export function invalidateInventoryEvent(invalidator: QueryInvalidator, scope: string, event: InventoryAlertEvent) {
  invalidator.invalidate(inventoryKeys.alerts(scope))
  invalidator.invalidate([...inventoryKeys.root(scope), 'low-stock'])
  invalidator.invalidate([...inventoryKeys.root(scope), 'balances'])
  void event
}

export function resyncInventory(invalidator: QueryInvalidator, scope: string) {
  invalidator.invalidate(inventoryKeys.root(scope))
}

/** New OPEN episodes are gathered for 400 ms (like the app) into one toast. */
export function createLowStockNotifier(delayMs = 400) {
  let pending = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    push(event: InventoryAlertEvent) {
      if (event.payload.status !== 'OPEN') return
      pending++
      if (timer) return
      timer = setTimeout(() => {
        toast.warning(pending > 1 ? `${pending} mặt hàng vừa xuống dưới ngưỡng tồn. Xem tại Kho → Cảnh báo tồn kho.` : 'Có mặt hàng vừa xuống dưới ngưỡng tồn. Xem tại Kho → Cảnh báo tồn kho.')
        pending = 0
        timer = undefined
      }, delayMs)
    },
    dispose() {
      if (timer) clearTimeout(timer)
      timer = undefined
      pending = 0
    },
  }
}
