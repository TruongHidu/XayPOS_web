import { useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useRealtimeStatus } from '../../../shared/realtime/RealtimeContext'
import { inventoryApi, inventoryKeys } from '../api/inventoryApi'
import { canViewInventoryAlerts } from '../policies/inventoryAccessPolicy'

/** Unacknowledged low-stock alert episodes (sidebar badge). */
export function useOpenAlertCount() {
  const { access, scope } = useTenantAccess()
  const realtime = useRealtimeStatus()
  const enabled = !!scope && canViewInventoryAlerts(access)
  const query = useQuery({
    queryKey: inventoryKeys.openAlertCount(scope),
    queryFn: ({ signal }) => inventoryApi.openAlertCount(scope!, signal),
    enabled,
    retry: false,
    refetchInterval: realtime.state === 'connected' ? false : 60_000,
  })
  return enabled ? query.data?.totalElements : undefined
}

/** Balances below their threshold right now (Tổng quan card). */
export function useLowStockCount() {
  const { access, scope } = useTenantAccess()
  const enabled = !!scope && canViewInventoryAlerts(access)
  const query = useQuery({
    queryKey: inventoryKeys.lowStock(scope, { count: true }),
    queryFn: ({ signal }) => inventoryApi.lowStock(scope!, { size: 1 }, signal),
    enabled,
    retry: false,
  })
  return { enabled, count: query.data?.totalElements, loading: query.isLoading }
}
