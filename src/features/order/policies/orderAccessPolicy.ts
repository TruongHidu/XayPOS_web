import { accessScope, hasFeature, hasPermission, tenantAccess, type TenantAccess } from '../../../shared/access/tenantAccess'
export { hasFeature, hasPermission, tenantAccess }
export type OrderAccess = TenantAccess
export const orderScope = accessScope
export function sameOrderScope(scope: string | null, access: OrderAccess) {
  return scope !== null && orderScope(access) === scope
}
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
/**
 * Đơn mang đi is a work queue (AccessPolicy.canTakeawayOrders in the app): it
 * shows to staff who can move a takeaway order along, not to read-only viewers.
 */
export const canTakeawayOrders = (a: OrderAccess) =>
  canOrder(a, 'ORDER_VIEW') &&
  hasFeature(a, 'POS_QUICK_ORDER') &&
  (canOrder(a, 'ORDER_CREATE') || canOrder(a, 'ORDER_UPDATE') || canOrder(a, 'ORDER_COMPLETE') || canPayment(a))
/** Historical recipe snapshot of a line (AccessPolicy.canViewOrderRecipeSnapshot). */
export const canViewLineRecipe = (a: OrderAccess) =>
  canOrder(a, 'ORDER_VIEW') && hasPermission(a, 'RECIPE_VIEW') && hasFeature(a, 'RECIPE_MANAGEMENT')
/** Stock reserved/consumed by a line (AccessPolicy.canViewOrderItemAllocation). */
export const canViewLineAllocation = (a: OrderAccess) =>
  canOrder(a, 'ORDER_VIEW') && hasPermission(a, 'INVENTORY_VIEW') && hasFeature(a, 'INVENTORY_MANAGEMENT')
