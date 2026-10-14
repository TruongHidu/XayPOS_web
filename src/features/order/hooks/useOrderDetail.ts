import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Order } from '../types'
import { ordersApi } from '../api/ordersApi'
import { orderKeys } from '../api/orderKeys'
import { canOrder } from '../policies/orderAccessPolicy'
import { useOrderAccess } from './useOrderAccess'
export function useOrderDetail(id: string) {
  const { access, scope } = useOrderAccess()
  const client = useQueryClient()
  return useQuery({
    queryKey: orderKeys.detail(scope, id),
    queryFn: async ({ signal }) => {
      const response = await ordersApi.detail(scope!, id, signal)
      const cached = client.getQueryData<Order>(orderKeys.detail(scope, id))
      return cached && cached.version > response.version ? cached : response
    },
    enabled: !!scope && canOrder(access, 'ORDER_VIEW'),
    retry: false,
  })
}
