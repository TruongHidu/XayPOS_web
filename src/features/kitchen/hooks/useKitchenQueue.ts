import { useQueries } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useRealtimeStatus } from '../../../shared/realtime/RealtimeContext'
import { orderKeys } from '../../order/api/orderKeys'
import { kitchenApi } from '../api/kitchenApi'
import { canKitchenView } from '../policies/kitchenAccessPolicy'
import type { KitchenItem } from '../schemas'
import type { KitchenStatus } from '../utils/kitchenModel'

const STATUSES: KitchenStatus[] = ['PENDING', 'COOKING', 'READY']
/** A busy kitchen rarely has more than a few hundred open lines; stop there to stay responsive. */
const MAX_PAGES = 5

async function loadAll(scope: string, status: KitchenStatus, signal?: AbortSignal) {
  const items: KitchenItem[] = []
  let truncated = false
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await kitchenApi.items(scope, { status, page, size: 100 }, signal)
    items.push(...result.content)
    if (page + 1 >= result.totalPages) return { items, truncated }
    truncated = page + 1 === MAX_PAGES
  }
  return { items, truncated }
}

/**
 * The three kitchen queues. Keys live under orderKeys.kitchens so the staff
 * realtime boundary subscribes the kitchen channel while this page is open;
 * without the socket it polls every 10 s.
 */
export function useKitchenQueue() {
  const { access, scope } = useTenantAccess()
  const realtime = useRealtimeStatus()
  const live = realtime.state === 'connected' && !realtime.code
  const queries = useQueries({
    queries: STATUSES.map((status) => ({
      queryKey: orderKeys.kitchen(scope, { status, all: true }),
      queryFn: ({ signal }: { signal: AbortSignal }) => loadAll(scope!, status, signal),
      enabled: !!scope && canKitchenView(access),
      retry: false,
      staleTime: 0,
      refetchInterval: live ? 60_000 : 10_000,
      refetchOnWindowFocus: !live,
    })),
  })
  const items = queries.flatMap((query) => query.data?.items ?? [])
  return {
    items,
    loading: queries.some((query) => query.isLoading),
    fetching: queries.some((query) => query.isFetching),
    error: queries.find((query) => query.error)?.error ?? null,
    truncated: queries.some((query) => query.data?.truncated),
    updatedAt: Math.max(0, ...queries.map((query) => query.dataUpdatedAt)),
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  }
}
