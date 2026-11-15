import { hasFeature, hasPermission, type TenantAccess } from '../../../shared/access/tenantAccess'
import { canCreateType, canOrder } from '../../order/policies/orderAccessPolicy'

/**
 * Port of AccessPolicy.canTables (pos_saas_app): TABLE_MANAGEMENT in the
 * package plus the table permission. The app's role list only excluded
 * CASHIER because cashiers worked on the web; here permissions decide.
 * QR management deliberately needs TABLE_UPDATE, not TABLE_VIEW.
 */
export const canTable = (a: TenantAccess, permission: string) => hasFeature(a, 'TABLE_MANAGEMENT') && hasPermission(a, permission)

/** "Gọi món" from a table opens the POS with that table or session. */
export const canOrderAtTable = (a: TenantAccess) => canCreateType(a, 'DINE_IN') || canOrder(a, 'ORDER_UPDATE')
export const canViewTableOrders = (a: TenantAccess) => canOrder(a, 'ORDER_VIEW')
