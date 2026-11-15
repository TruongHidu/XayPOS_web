import { useAuthStore } from '../../features/auth/store/authStore'
import { accessScope, type TenantAccess } from './tenantAccess'

/** Current tenant access snapshot plus its cache scope (null when not a tenant session). */
export function useTenantAccess() {
  const user = useAuthStore((s) => s.user)
  const entitlement = useAuthStore((s) => s.entitlement)
  const entitlementState = useAuthStore((s) => s.entitlementState)
  const access: TenantAccess = { user, entitlement, entitlementState }
  return { access, scope: accessScope(access) }
}
