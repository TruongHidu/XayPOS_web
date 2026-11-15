import type { QueryKey } from '@tanstack/react-query'

/**
 * Every restaurant (tenant) query lives under `['tenant', scope, module, ...]`.
 * `scope` is `tenantScope(...)`, so a login/role/permission/entitlement change
 * makes old cache entries unreachable and `OrderRuntimeBoundary` removes them.
 *
 * Management modules pick their own module name (e.g. `menu-admin`,
 * `table-admin`) so order realtime events do not invalidate them by accident:
 * StaffRealtimeBoundary only refreshes the order-related module names.
 */
export const TENANT_KEY_ROOT = 'tenant' as const

export const tenantKeys = {
  root: (scope: string | null) => [TENANT_KEY_ROOT, scope] as const,
  module: <M extends string>(scope: string | null, module: M) => [TENANT_KEY_ROOT, scope, module] as const,
}

export function isTenantKey(key: QueryKey, scope?: string | null): boolean {
  return key[0] === TENANT_KEY_ROOT && (scope === undefined || key[1] === scope)
}
