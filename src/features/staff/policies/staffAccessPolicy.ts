import { hasFeature, hasPermission, hasRole, type TenantAccess } from '../../../shared/access/tenantAccess'

/**
 * Port of AccessPolicy.canStaff / canAssignStaffRole / canManageStaff
 * (pos_saas_app). Only OWNER and MANAGER manage staff; the backend enforces
 * the same hierarchy (OWNER → MANAGER/WAITER/KITCHEN/CASHIER, MANAGER →
 * WAITER/KITCHEN/CASHIER), protects the OWNER and forbids self-management.
 */
export function canStaff(a: TenantAccess, permission: string) {
  return (
    hasRole(a, 'OWNER', 'MANAGER') &&
    hasPermission(a, permission) &&
    hasFeature(a, 'STAFF_MANAGEMENT') &&
    (permission !== 'STAFF_PERMISSION_MANAGE' || hasFeature(a, 'STAFF_PERMISSION'))
  )
}

export function canAssignStaffRole(a: TenantAccess, roleCode: string) {
  if (!hasRole(a, 'OWNER', 'MANAGER')) return false
  return ['WAITER', 'KITCHEN', 'CASHIER'].includes(roleCode) || (roleCode === 'MANAGER' && hasRole(a, 'OWNER'))
}

export function canManageStaff(a: TenantAccess, permission: string, staffId: string, roleCode: string) {
  return canStaff(a, permission) && a.user?.id !== staffId && canAssignStaffRole(a, roleCode)
}
