import { useAuthStore } from '../../auth/store/authStore'
import { orderScope } from '../policies/orderAccessPolicy'
export function useOrderAccess() {
  const user = useAuthStore((s) => s.user)
  const entitlement = useAuthStore((s) => s.entitlement)
  const entitlementState = useAuthStore((s) => s.entitlementState)
  const access = { user, entitlement, entitlementState }
  return { access, scope: orderScope(access) }
}
