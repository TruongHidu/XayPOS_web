import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { StatusPage } from '../../../shared/components/StatusPage'
import { defaultRouteForUser, isInternalPath } from '../../../shared/utils/routing'
import type { UserRole } from '../../../shared/types/auth'

export function PublicOnlyRoute() {
  const status = useAuthStore((state) => state.status)
  const user = useAuthStore((state) => state.user)
  const location = useLocation()
  if (status === 'bootstrapping') return <StatusPage kind="loading" title="Đang khôi phục phiên đăng nhập" />
  if (!user) return <Outlet />
  const requested = new URLSearchParams(location.search).get('returnUrl')
  return <Navigate to={isInternalPath(requested) ? requested : defaultRouteForUser(user)} replace />
}

export function RequireAuth() {
  const status = useAuthStore((state) => state.status)
  const user = useAuthStore((state) => state.user)
  const location = useLocation()
  if (status === 'bootstrapping') return <StatusPage kind="loading" title="Đang khôi phục phiên đăng nhập" />
  if (!user) {
    const returnUrl = `${location.pathname}${location.search}`
    return <Navigate to={`/login?returnUrl=${encodeURIComponent(returnUrl)}`} replace />
  }
  return <Outlet />
}

export function RequireRole({ roles }: { roles: UserRole[] }) {
  const user = useAuthStore((state) => state.user)
  const validRole = Boolean(user && roles.includes(user.role))
  const validAdminTenant = !roles.includes('SUPER_ADMIN') || user?.restaurantId === null
  return validRole && validAdminTenant ? <Outlet /> : <Navigate to="/forbidden" replace />
}

export function RequirePermission({ permission }: { permission: string }) {
  const user = useAuthStore((state) => state.user)
  return user?.permissions.includes(permission) ? <Outlet /> : <Navigate to="/forbidden" replace />
}

export function RequireTenant() {
  const user = useAuthStore((state) => state.user)
  return user?.restaurantId !== null && user?.restaurantId !== undefined ? <Outlet /> : <Navigate to="/forbidden" replace />
}

export function RequireFeature({ feature }: { feature: string }) {
  const entitlement = useAuthStore((state) => state.entitlement)
  const state = useAuthStore((store) => store.entitlementState)
  if (state === 'loading') return <StatusPage kind="loading" title="Đang tải quyền truy cập" />
  return entitlement?.features.some((item) => item.code === feature) ? <Outlet /> : <Navigate to="/access-unavailable" replace />
}
