import type { QueryClient } from '@tanstack/react-query'
import type { OrderEvent } from '../../../shared/realtime/events'
import type { QueryInvalidator } from '../../../shared/realtime/queryInvalidator'
import { orderKeys } from '../api/orderKeys'

export function invalidateOrderEvent(invalidator: QueryInvalidator, scope: string, event: OrderEvent) {
  invalidator.invalidate(orderKeys.lists(scope))
  invalidator.invalidate(orderKeys.detail(scope, event.resourceId), true)
  invalidator.invalidate(orderKeys.tables(scope))
  invalidator.invalidate(orderKeys.selectedTables(scope))
  if (event.payload.tableSessionId) {
    invalidator.invalidate(orderKeys.active(scope, event.payload.tableSessionId), true)
    invalidator.invalidate(orderKeys.session(scope, event.payload.tableSessionId), true)
  }
}
export function resyncOrders(invalidator: QueryInvalidator, client: QueryClient, scope: string) {
  for (const query of client.getQueryCache().getAll()) {
    const [portal, keyScope, kind] = query.queryKey
    if (
      portal === 'cashier' &&
      keyScope === scope &&
      ['orders', 'order', 'tables', 'active-order', 'session', 'selected-table'].includes(String(kind))
    )
      invalidator.invalidate(query.queryKey, true)
  }
}
