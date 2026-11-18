import { hasFeature, hasPermission, type TenantAccess } from '../../../shared/access/tenantAccess'
import { canViewInventory } from '../../inventory/policies/inventoryAccessPolicy'

export type CashbookPermission = 'CASHBOOK_VIEW' | 'CASHBOOK_CREATE' | 'CASHBOOK_VOID'

/**
 * Port of AccessPolicy.canCashbook / canLinkCashbookStockReceipt /
 * canReconcileCashbookReceipts (pos_saas_app). Permission × package feature,
 * never a hard-coded role (cashbook-fe-sync.md). Every action also needs
 * CASHBOOK_VIEW because the screen it lives on reads the cashbook.
 */
export function canCashbook(a: TenantAccess, permission: CashbookPermission) {
  if (!hasFeature(a, 'DETAIL_REPORT') || !hasPermission(a, permission)) return false
  return permission === 'CASHBOOK_VIEW' || hasPermission(a, 'CASHBOOK_VIEW')
}

export const canViewCashbook = (a: TenantAccess) => canCashbook(a, 'CASHBOOK_VIEW')
export const canCreateExpense = (a: TenantAccess) => canCashbook(a, 'CASHBOOK_CREATE')
export const canVoidExpense = (a: TenantAccess) => canCashbook(a, 'CASHBOOK_VOID')
/** Linking a stock receipt also needs INVENTORY_VIEW + the inventory package. */
export const canLinkStockReceipt = (a: TenantAccess) => canCreateExpense(a) && canViewInventory(a)
/** Receipt reconciliation reads stock documents, so it needs inventory access too. */
export const canReconcileReceipts = (a: TenantAccess) => canViewCashbook(a) && canViewInventory(a)
