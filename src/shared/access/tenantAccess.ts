import { tenantScope } from '../auth/tenantScope'
import type { AuthUser, CurrentEntitlement, EntitlementState, UserRole } from '../types/auth'

/**
 * Everything a tenant (restaurant) access rule needs. Module policies
 * (`features/<module>/policies/*AccessPolicy.ts`) build on these helpers and
 * mirror `pos_saas_app/lib/core/auth/access_policy.dart` rule by rule:
 * package feature × staff permission (× role only where the app uses it as a
 * business rule).
 */
export interface TenantAccess {
  user: AuthUser | null
  entitlement: CurrentEntitlement | null
  entitlementState: EntitlementState
}

export const accessScope = tenantScope

/** Signed-in restaurant staff with an active subscription. */
export function tenantAccess(a: TenantAccess) {
  return (
    !!a.user?.restaurantId &&
    a.user.role !== 'SUPER_ADMIN' &&
    a.entitlementState === 'active' &&
    a.entitlement?.status === 'ACTIVE'
  )
}

export function hasFeature(a: TenantAccess, feature: string) {
  return tenantAccess(a) && !!a.entitlement?.features.some((f) => f.code === feature)
}

export const hasAnyFeature = (a: TenantAccess, ...features: string[]) => features.some((f) => hasFeature(a, f))

export const hasPermission = (a: TenantAccess, permission: string) =>
  tenantAccess(a) && !!a.user?.permissions.includes(permission)

export const hasAllPermissions = (a: TenantAccess, ...permissions: string[]) =>
  permissions.every((p) => hasPermission(a, p))

export const hasRole = (a: TenantAccess, ...roles: UserRole[]) => tenantAccess(a) && !!a.user && roles.includes(a.user.role)

/** Roles the Flutter app lets into management modules (menu, tables, recipes...). */
export const MANAGEMENT_ROLES: UserRole[] = ['OWNER', 'MANAGER', 'WAITER', 'KITCHEN']
