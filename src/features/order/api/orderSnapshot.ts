import type { QueryClient } from '@tanstack/react-query'
import type { Order } from '../types'
import { orderKeys } from './orderKeys'

/** A delayed REST mutation response must not replace a more recent snapshot. */
export function cacheOrderSnapshot(client: QueryClient, scope: string | null, incoming: Order) {
  return client.setQueryData<Order>(orderKeys.detail(scope, incoming.id), (cached) =>
    cached && cached.version > incoming.version ? cached : incoming,
  )!
}
