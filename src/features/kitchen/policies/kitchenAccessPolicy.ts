import { hasFeature, hasPermission, type TenantAccess } from '../../../shared/access/tenantAccess'

/**
 * Port of AccessPolicy.canKitchen (pos_saas_app) and the KDS button rules in
 * XayPOS_be/docs/kitchen-completion-api.md. Permissions decide, not roles.
 */
export const canKitchenView = (a: TenantAccess) => hasFeature(a, 'KITCHEN_DISPLAY') && hasPermission(a, 'KITCHEN_VIEW')
export const canStartCooking = (a: TenantAccess) => canKitchenView(a) && hasPermission(a, 'KITCHEN_START_COOKING')
/** Single line COOKING → READY, and "Xong cả đơn" (bulk PENDING/COOKING → READY). */
export const canMarkReady = (a: TenantAccess) => canKitchenView(a) && hasPermission(a, 'KITCHEN_MARK_READY')
/** "Đã giao": READY → SERVED for a line, or every line of the order. */
export const canMarkServedFromKitchen = (a: TenantAccess) =>
  hasFeature(a, 'ORDER_MANAGEMENT') && hasPermission(a, 'ORDER_MARK_SERVED')
