import { tenantScope } from '../../../shared/auth/tenantScope'
import type { AuthUser, CurrentEntitlement, EntitlementState } from '../../../shared/types/auth'
export interface OrderAccess {
  user: AuthUser | null
  entitlement: CurrentEntitlement | null
  entitlementState: EntitlementState
}
export const orderScope = tenantScope
export function sameOrderScope(scope: string | null, access: OrderAccess) {
  return scope !== null && orderScope(access) === scope
}
export function tenantAccess(a: OrderAccess) {
  return (
    !!a.user?.restaurantId &&
    a.user.role !== 'SUPER_ADMIN' &&
    a.entitlementState === 'active' &&
    a.entitlement?.status === 'ACTIVE'
  )
}
export function hasFeature(a: OrderAccess, feature: string) {
  return tenantAccess(a) && !!a.entitlement?.features.some((f) => f.code === feature)
}
export const hasPermission = (a: OrderAccess, permission: string) =>
  tenantAccess(a) && !!a.user?.permissions.includes(permission)
export const canOrder = (a: OrderAccess, permission: string) =>
  hasPermission(a, permission) && hasFeature(a, 'ORDER_MANAGEMENT')
export const canCreateType = (a: OrderAccess, type: 'DINE_IN' | 'TAKEAWAY') =>
  canOrder(a, 'ORDER_CREATE') && canSubmitType(a, type)
export const canSubmitType = (a: OrderAccess, type: 'DINE_IN' | 'TAKEAWAY') =>
  canOrder(a, 'ORDER_UPDATE') && hasFeature(a, type === 'TAKEAWAY' ? 'POS_QUICK_ORDER' : 'TABLE_MANAGEMENT')
export const canPayment = (a: OrderAccess) =>
  hasFeature(a, 'PAYMENT_MANAGEMENT') && hasPermission(a, 'PAYMENT_CREATE') && hasPermission(a, 'PAYMENT_CONFIRM')
export const canViewPayment = (a: OrderAccess) =>
  hasFeature(a, 'PAYMENT_MANAGEMENT') && hasPermission(a, 'PAYMENT_VIEW')
export const canCloseTable = (a: OrderAccess) => canTables(a) && hasPermission(a, 'TABLE_CLOSE')
export const canKitchen = (a: OrderAccess, permission: string) =>
  hasFeature(a, 'KITCHEN_DISPLAY') && hasPermission(a, permission)
export const canMenu = (a: OrderAccess) => hasPermission(a, 'MENU_VIEW') && hasFeature(a, 'MENU_MANAGEMENT')
export const canTables = (a: OrderAccess) => hasPermission(a, 'TABLE_VIEW') && hasFeature(a, 'TABLE_MANAGEMENT')
export const canMarkServed = (a: OrderAccess) => canOrder(a, 'ORDER_MARK_SERVED')
export const canCompleteOrder = (a: OrderAccess, serviceType?: 'DINE_IN' | 'TAKEAWAY') => {
  if (!canOrder(a, 'ORDER_COMPLETE')) return false
  if (serviceType === 'DINE_IN') {
    return hasPermission(a, 'TABLE_CLOSE') && hasFeature(a, 'TABLE_MANAGEMENT')
  }
  return true
}
