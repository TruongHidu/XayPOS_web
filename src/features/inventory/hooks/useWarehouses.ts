import { useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { inventoryApi, inventoryKeys } from '../api/inventoryApi'
import { canViewInventory } from '../policies/inventoryAccessPolicy'

/** Every warehouse of the restaurant (a handful), shared by selects and pages. */
export function useWarehouses() {
  const { access, scope } = useTenantAccess()
  const query = useQuery({
    queryKey: inventoryKeys.warehouses(scope),
    queryFn: ({ signal }) => inventoryApi.warehouses(scope!, signal),
    enabled: !!scope && canViewInventory(access),
    staleTime: 30_000,
  })
  return { ...query, data: query.data?.content, defaultWarehouse: query.data?.content.find((w) => w.isDefault && w.active) }
}
