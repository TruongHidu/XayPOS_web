import { useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { cashierTablesApi } from '../../tables/api/cashierTablesApi'
import type { RestaurantTable, TableSession } from '../../tables/schemas'
import { useAuthStore } from '../../auth/store/authStore'
import { canCreateType, canOrder, canTables, hasPermission, orderScope } from '../policies/orderAccessPolicy'
import { ordersApi } from '../api/ordersApi'
import { orderKeys } from '../api/orderKeys'
import { useOrderAccess } from './useOrderAccess'
import type { ServiceContext } from '../types'
import { resourceId } from '../../../shared/api/tenantSchemas'
const requireOpen = (s: TableSession | null): ServiceContext => {
  if (!s || s.status !== 'OPEN') throw new Error('TABLE_SESSION_NOT_OPEN')
  return { serviceType: 'DINE_IN', tableSessionId: s.id, guestCount: s.guestCount, tableName: s.tableName }
}
async function servingContext(scope: string, session: TableSession | null, signal?: AbortSignal) {
  const context = requireOpen(session)
  if (!canOrder(useAuthStore.getState(), 'ORDER_VIEW')) throw new Error('DINE_IN_ORDER_VIEW_REQUIRED')
  const order = await ordersApi.active(scope, context.tableSessionId!, signal)
  return { ...context, activeOrderId: order?.id }
}
function emptyTableContext(table: RestaurantTable): ServiceContext {
  if (table.status !== 'AVAILABLE' || table.area?.active === false) throw new Error('TABLE_INACTIVE')
  if (!table.canOpen) throw new Error('TABLE_ALREADY_OCCUPIED')
  if (!hasPermission(useAuthStore.getState(), 'TABLE_OPEN')) throw new Error('TABLE_OPEN_REQUIRED')
  return { serviceType: 'DINE_IN', tableId: table.id, tableSessionId: null, guestCount: 1, tableName: table.name }
}
export function useOrderServiceContext(type: 'DINE_IN' | 'TAKEAWAY') {
  const { access, scope } = useOrderAccess()
  const [occupied, setOccupied] = useState<boolean | undefined>()
  const [areaId, setAreaId] = useState<string | undefined>()
  const [page, setPage] = useState(0)
  const criteria = { occupied, areaId, page }
  const enabled = type === 'DINE_IN' && !!scope && canTables(access) && canCreateType(access, 'DINE_IN')
  const tables = useQuery({
    queryKey: orderKeys.tableList(scope, criteria),
    queryFn: ({ signal }) => cashierTablesApi.tables(scope!, criteria, signal),
    enabled,
    retry: false,
  })
  const areas = useInfiniteQuery({
    queryKey: orderKeys.areas(scope),
    initialPageParam: 0,
    queryFn: ({ signal, pageParam }) => cashierTablesApi.areas(scope!, pageParam, signal),
    getNextPageParam: (last) => (last.page + 1 < last.totalPages ? last.page + 1 : undefined),
    enabled,
    retry: false,
  })
  const prepare = useMutation({
    retry: false,
    mutationFn: async (id: string) => {
      if (!scope || !canTables(useAuthStore.getState()) || !canCreateType(useAuthStore.getState(), 'DINE_IN'))
        throw new Error('ORDER_ACCESS_CHANGED')
      return cashierTablesApi.table(scope, id)
    },
  })
  const current = async (tableId: string) => {
    if (!scope || !canTables(useAuthStore.getState()) || !canCreateType(useAuthStore.getState(), 'DINE_IN'))
      throw new Error('ORDER_ACCESS_CHANGED')
    return servingContext(scope, await cashierTablesApi.current(scope, tableId))
  }
  return {
    tables,
    areas,
    prepare,
    emptyTableContext,
    current,
    enabled,
    page,
    setPage,
    areaId,
    setArea: (id: string | undefined) => {
      setAreaId(id)
      setPage(0)
    },
    occupied,
    setOccupied: (value: boolean | undefined) => {
      setOccupied(value)
      setPage(0)
    },
  }
}
export function useDineInContext(sessionId: string | undefined, tableId?: string) {
  const { access, scope } = useOrderAccess()
  return useQuery({
    queryKey: sessionId ? orderKeys.session(scope, sessionId) : ['cashier', scope, 'selected-table', tableId],
    retry: false,
    enabled:
      !!scope &&
      !!(sessionId || tableId) &&
      resourceId.safeParse(sessionId ?? tableId).success &&
      canTables(access) &&
      canCreateType(access, 'DINE_IN'),
    queryFn: async ({ signal }) => {
      if (tableId) {
        const table = await cashierTablesApi.table(scope!, tableId, signal)
        if (table.status !== 'AVAILABLE' || table.area?.active === false) throw new Error('TABLE_INACTIVE')
        if (table.occupied || table.currentSession)
          return servingContext(scope!, await cashierTablesApi.current(scope!, table.id), signal)
        return emptyTableContext(table)
      }
      const s = await cashierTablesApi.session(scope!, sessionId!, signal)
      const table = await cashierTablesApi.table(scope!, s.tableId, signal)
      if (
        s.status !== 'OPEN' ||
        table.status !== 'AVAILABLE' ||
        table.area?.active === false ||
        !table.occupied ||
        table.currentSession?.id !== s.id
      )
        throw new Error('TABLE_SESSION_NOT_OPEN')
      if (orderScope(useAuthStore.getState()) !== scope) throw new Error('ORDER_ACCESS_CHANGED')
      return servingContext(scope!, s, signal)
    },
  })
}
