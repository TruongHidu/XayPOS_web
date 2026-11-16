import { useQueries } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useRealtimeStatus } from '../../../shared/realtime/RealtimeContext'
import { orderKeys } from '../api/orderKeys'
import { ordersApi } from '../api/ordersApi'
import { canTakeawayOrders } from '../policies/orderAccessPolicy'
import { orderCriteriaSchema } from '../schemas'

const SERVING = ['OPEN', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'] as const

/** Takeaway orders still being served (like the app's takeaway count): one tiny page per status. */
export function useTakeawayCount() {
  const { access, scope } = useTenantAccess()
  const realtime = useRealtimeStatus()
  const enabled = !!scope && canTakeawayOrders(access)
  const results = useQueries({
    queries: SERVING.map((status) => {
      const criteria = orderCriteriaSchema.parse({ status, serviceType: 'TAKEAWAY', size: 1 })
      return {
        queryKey: orderKeys.list(scope, criteria),
        queryFn: ({ signal }: { signal: AbortSignal }) => ordersApi.list(scope!, criteria, signal),
        enabled,
        retry: false,
        refetchInterval: realtime.state === 'connected' ? (false as const) : 60_000,
      }
    }),
  })
  if (!enabled || results.some((result) => !result.data)) return undefined
  return results.reduce((sum, result) => sum + (result.data?.totalElements ?? 0), 0)
}
