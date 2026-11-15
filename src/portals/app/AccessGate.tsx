import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { StatusPage } from '../../shared/components/StatusPage'
import type { TenantAccess } from '../../shared/access/tenantAccess'
import { useTenantAccess } from '../../shared/access/useTenantAccess'

/** Extra rule for one page inside a section (e.g. recipes need RECIPE_VIEW on top of Thực đơn). */
export function AccessGate({
  allow,
  fallback,
  children,
}: {
  allow: (access: TenantAccess) => boolean
  fallback: string
  children: ReactNode
}) {
  const { access } = useTenantAccess()
  if (access.entitlementState === 'loading') return <StatusPage kind="loading" title="Đang kiểm tra quyền truy cập" />
  return allow(access) ? children : <Navigate to={fallback} replace />
}
