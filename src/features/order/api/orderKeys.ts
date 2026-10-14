import type { OrderCriteria } from '../types'
export const orderKeys = {
  root: (scope: string | null) => ['cashier', scope] as const,
  lists: (scope: string | null) => ['cashier', scope, 'orders'] as const,
  list: (scope: string | null, criteria: OrderCriteria) => ['cashier', scope, 'orders', criteria] as const,
  detail: (scope: string | null, id: string) => ['cashier', scope, 'order', id.toLowerCase()] as const,
  tables: (scope: string | null) => ['cashier', scope, 'tables'] as const,
  tableList: (scope: string | null, criteria: object) => ['cashier', scope, 'tables', criteria] as const,
  areas: (scope: string | null) => ['cashier', scope, 'areas'] as const,
  menu: (scope: string | null, criteria: object) => ['cashier', scope, 'menu', criteria] as const,
  groups: (scope: string | null) => ['cashier', scope, 'groups'] as const,
  session: (scope: string | null, id: string) => ['cashier', scope, 'session', id.toLowerCase()] as const,
  sessions: (scope: string | null) => ['cashier', scope, 'session'] as const,
  active: (scope: string | null, id: string) => ['cashier', scope, 'active-order', id.toLowerCase()] as const,
  activeOrders: (scope: string | null) => ['cashier', scope, 'active-order'] as const,
  kitchen: (scope: string | null, criteria: object) => ['cashier', scope, 'kitchen', criteria] as const,
  payments: (scope: string | null, id: string) => ['cashier', scope, 'payments', id.toLowerCase()] as const,
}
