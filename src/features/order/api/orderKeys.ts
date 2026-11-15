import type { OrderCriteria } from '../types'
import { TENANT_KEY_ROOT } from '../../../shared/api/tenantKeys'
export const orderKeys = {
  root: (scope: string | null) => [TENANT_KEY_ROOT, scope] as const,
  lists: (scope: string | null) => [TENANT_KEY_ROOT, scope, 'orders'] as const,
  list: (scope: string | null, criteria: OrderCriteria) => [TENANT_KEY_ROOT, scope, 'orders', criteria] as const,
  detail: (scope: string | null, id: string) => [TENANT_KEY_ROOT, scope, 'order', id.toLowerCase()] as const,
  tables: (scope: string | null) => [TENANT_KEY_ROOT, scope, 'tables'] as const,
  tableList: (scope: string | null, criteria: object) => [TENANT_KEY_ROOT, scope, 'tables', criteria] as const,
  areas: (scope: string | null) => [TENANT_KEY_ROOT, scope, 'areas'] as const,
  menus: (scope: string | null) => [TENANT_KEY_ROOT, scope, 'menu'] as const,
  // Old menu cache has no recipe/cost flags; read a fresh validated DTO after upgrade.
  menu: (scope: string | null, criteria: object) => [...orderKeys.menus(scope), 'recipe-cost-v1', criteria] as const,
  groups: (scope: string | null) => [TENANT_KEY_ROOT, scope, 'groups'] as const,
  session: (scope: string | null, id: string) => [TENANT_KEY_ROOT, scope, 'session', id.toLowerCase()] as const,
  sessions: (scope: string | null) => [TENANT_KEY_ROOT, scope, 'session'] as const,
  active: (scope: string | null, id: string) => [TENANT_KEY_ROOT, scope, 'active-order', id.toLowerCase()] as const,
  activeOrders: (scope: string | null) => [TENANT_KEY_ROOT, scope, 'active-order'] as const,
  selectedTables: (scope: string | null) => [TENANT_KEY_ROOT, scope, 'selected-table'] as const,
  selectedTable: (scope: string | null, id: string | undefined) => [TENANT_KEY_ROOT, scope, 'selected-table', id] as const,
  kitchen: (scope: string | null, criteria: object) => [TENANT_KEY_ROOT, scope, 'kitchen', criteria] as const,
  kitchens: (scope: string | null) => [TENANT_KEY_ROOT, scope, 'kitchen'] as const,
  payments: (scope: string | null, id: string) => [TENANT_KEY_ROOT, scope, 'payments', id.toLowerCase()] as const,
}
