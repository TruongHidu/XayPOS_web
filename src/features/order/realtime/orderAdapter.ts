import type { QueryClient } from '@tanstack/react-query'
import type { OrderEvent } from '../../../shared/realtime/events'
import type { QueryInvalidator } from '../../../shared/realtime/queryInvalidator'
import { orderKeys } from '../api/orderKeys'
import { TENANT_KEY_ROOT, tenantKeys } from '../../../shared/api/tenantKeys'

export function invalidateOrderEvent(invalidator: QueryInvalidator, scope: string, event: OrderEvent) {
  invalidator.invalidate(orderKeys.lists(scope))
  invalidator.invalidate(orderKeys.detail(scope, event.resourceId), true)
  invalidator.invalidate(orderKeys.tables(scope))
  invalidator.invalidate(orderKeys.selectedTables(scope))
  // Sơ đồ bàn (management): completion/cancel/transfer change occupancy.
  invalidator.invalidate(tenantKeys.module(scope, 'table-admin'))
  if (event.payload.tableSessionId) {
    invalidator.invalidate(orderKeys.active(scope, event.payload.tableSessionId), true)
    invalidator.invalidate(orderKeys.session(scope, event.payload.tableSessionId), true)
  }
}
export function resyncOrders(invalidator: QueryInvalidator, client: QueryClient, scope: string) {
  for (const query of client.getQueryCache().getAll()) {
    const [portal, keyScope, kind] = query.queryKey
    if (
      portal === TENANT_KEY_ROOT &&
      keyScope === scope &&
      ['orders', 'order', 'tables', 'active-order', 'session', 'selected-table', 'table-admin'].includes(String(kind))
    )
      invalidator.invalidate(query.queryKey, true)
  }
}
