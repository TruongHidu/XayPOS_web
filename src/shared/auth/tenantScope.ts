import type { AuthUser, CurrentEntitlement } from '../types/auth'
export function tenantScope(access: { user: AuthUser | null; entitlement: CurrentEntitlement | null }): string | null {
  const { user, entitlement } = access
  if (!user || !user.restaurantId || user.role === 'SUPER_ADMIN') return null
  return JSON.stringify([
    user.id,
    user.restaurantId,
    user.role,
    [...user.permissions].sort(),
    entitlement?.subscriptionId ?? null,
    entitlement?.status ?? null,
    entitlement?.features.map((f) => f.code).sort() ?? [],
  ])
}
