import { useQuery } from '@tanstack/react-query'
import { ordersApi } from '../api/ordersApi'
import { orderKeys } from '../api/orderKeys'
import { canOrder } from '../policies/orderAccessPolicy'
import { useOrderAccess } from './useOrderAccess'
import type { OrderCriteria } from '../types'
import { useRealtimeStatus } from '../../../shared/realtime/RealtimeContext'
export function useOrders(criteria: OrderCriteria) {
  const { access, scope } = useOrderAccess()
  const realtime = useRealtimeStatus()
  return useQuery({
    queryKey: orderKeys.list(scope, criteria),
    queryFn: ({ signal }) => ordersApi.list(scope!, criteria, signal),
    enabled: !!scope && canOrder(access, 'ORDER_VIEW'),
    retry: false,
    refetchOnWindowFocus: realtime.state !== 'connected',
  })
}
