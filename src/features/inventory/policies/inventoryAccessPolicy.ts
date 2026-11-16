import { hasFeature, hasPermission, type TenantAccess } from '../../../shared/access/tenantAccess'
import type { DocumentType } from '../schemas'

/**
 * Port of AccessPolicy.canInventory and the alert/audit helpers (pos_saas_app).
 * Sub-permissions also need INVENTORY_VIEW and their own package feature.
 * Like the other web modules, the CASHIER role is not excluded; only the
 * realtime alert channel keeps the backend's role allowlist (channelPolicy).
 */
export function canInventory(a: TenantAccess, permission: string) {
  if (!hasFeature(a, 'INVENTORY_MANAGEMENT') || !hasPermission(a, permission)) return false
  if (['INVENTORY_ALERT_ACKNOWLEDGE', 'STOCK_AUDIT_MANAGE', 'STOCK_AUDIT_CONFIRM'].includes(permission) && !hasPermission(a, 'INVENTORY_VIEW'))
    return false
  if (permission === 'INVENTORY_ALERT_ACKNOWLEDGE' && !hasFeature(a, 'LOW_STOCK_ALERT')) return false
  if (permission.startsWith('STOCK_AUDIT_') && !hasFeature(a, 'STOCK_AUDIT')) return false
  return true
}

export const canViewInventory = (a: TenantAccess) => canInventory(a, 'INVENTORY_VIEW')
export const canViewInventoryAlerts = (a: TenantAccess) => canViewInventory(a) && hasFeature(a, 'LOW_STOCK_ALERT')
export const canAcknowledgeAlert = (a: TenantAccess) => canViewInventoryAlerts(a) && canInventory(a, 'INVENTORY_ALERT_ACKNOWLEDGE')
export const canViewStockAudits = (a: TenantAccess) => canViewInventory(a) && hasFeature(a, 'STOCK_AUDIT')
export const canManageStockAudits = (a: TenantAccess) => canViewStockAudits(a) && canInventory(a, 'STOCK_AUDIT_MANAGE')
export const canConfirmStockAudits = (a: TenantAccess) => canViewStockAudits(a) && canInventory(a, 'STOCK_AUDIT_CONFIRM')

const documentPermission: Record<DocumentType, string> = {
  RECEIPT: 'INVENTORY_RECEIVE',
  ISSUE: 'INVENTORY_ISSUE',
  ADJUSTMENT: 'INVENTORY_ADJUST',
}
/** Create, edit, confirm and cancel a document of this type. */
export const canWriteDocument = (a: TenantAccess, type: DocumentType) => canInventory(a, documentPermission[type])
export const writableDocumentTypes = (a: TenantAccess) => (Object.keys(documentPermission) as DocumentType[]).filter((type) => canWriteDocument(a, type))
