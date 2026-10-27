import type { OrderEvent } from '../../../shared/realtime/events'
import type { QueryInvalidator } from '../../../shared/realtime/queryInvalidator'
import { orderKeys } from '../../order/api/orderKeys'
/** Kitchen consumer only refetches kitchen/items; never fetches a full order. */
export function invalidateKitchenEvent(invalidator: QueryInvalidator, scope: string, _event: OrderEvent) {
  invalidator.invalidate(orderKeys.kitchens(scope))
}
