import { useQueries } from '@tanstack/react-query'
import { useQrReviewQueue } from '../../features/qr-order-review/hooks/useQrReview'
import { qrReviewCriteriaSchema } from '../../features/qr-order-review/schemas'
import { canOrder, canTakeawayOrders } from '../../features/order/policies/orderAccessPolicy'
import { orderKeys } from '../../features/order/api/orderKeys'
import { ordersApi } from '../../features/order/api/ordersApi'
import { orderCriteriaSchema } from '../../features/order/schemas'
import { useTenantAccess } from '../../shared/access/useTenantAccess'
import { useRealtimeStatus } from '../../shared/realtime/RealtimeContext'

// Same criteria as the default Đơn hàng board, so the badge shares its cache entry.
const pendingQrCriteria = qrReviewCriteriaSchema.parse({ page: 0 })

/** QR requests waiting for staff, shown on "Đơn hàng" (the inbox lives on that board). */
export function useQrPendingBadge() {
  const { access } = useTenantAccess()
  const canHandle = canOrder(access, 'ORDER_VIEW') && canOrder(access, 'ORDER_UPDATE')
  const query = useQrReviewQueue(pendingQrCriteria, canHandle)
  return canHandle ? query.data?.totalElements : undefined
}

const SERVING = ['OPEN', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'] as const

/** Takeaway orders still being served (like the app's takeaway count): one tiny page per status. */
export function useTakeawayBadge() {
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
