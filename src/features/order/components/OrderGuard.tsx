import { Navigate, Outlet } from 'react-router-dom'
import { StatusPage } from '../../../shared/components/StatusPage'
import { useOrderAccess } from '../hooks/useOrderAccess'
import { canOrder, hasFeature } from '../policies/orderAccessPolicy'
export function OrderGuard({ permission }: { permission: string }) {
  const { access } = useOrderAccess()
  if (access.entitlementState === 'loading') return <StatusPage kind="loading" title="Đang kiểm tra quyền gọi món" />
  if (!hasFeature(access, 'ORDER_MANAGEMENT')) return <Navigate to="/access-unavailable" replace />
  if (canOrder(access, permission)) return <Outlet />
  if (permission === 'ORDER_CREATE' && canOrder(access, 'ORDER_VIEW')) return <Navigate to="/cashier/orders" replace />
  if (permission === 'ORDER_VIEW' && canOrder(access, 'ORDER_CREATE')) return <Navigate to="/cashier/pos" replace />
  return <Navigate to="/forbidden" replace />
}
