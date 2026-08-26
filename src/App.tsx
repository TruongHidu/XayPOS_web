import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { LoginPage } from './features/auth/pages/LoginPage'
import { PublicOnlyRoute, RequireAuth, RequireFeature, RequirePermission, RequireRole, RequireTenant } from './features/auth/guards'
import { useAuthStore } from './features/auth/store/authStore'
import { AdminShell } from './portals/admin/AdminShell'
import { CashierShell } from './portals/cashier/CashierShell'
import { QrMenuPage } from './portals/qr-menu/QrMenuPage'
import { DashboardPage, PlaceholderPage } from './portals/portalPages'
import { StatusPage } from './shared/components/StatusPage'
import { defaultRouteForUser } from './shared/utils/routing'

function TenantPortal() {
  const user = useAuthStore((state) => state.user)
  const entitlementState = useAuthStore((state) => state.entitlementState)

  if (!user || user.restaurantId === null) return <Navigate to="/forbidden" replace />
  if (entitlementState === 'inactive') {
    return <Navigate to={user.role === 'OWNER' || user.role === 'MANAGER' ? '/subscription-required' : '/access-unavailable'} replace />
  }
  if (entitlementState === 'error') return <StatusPage kind="network" title="Không thể tải quyền truy cập" description="Máy chủ không khả dụng hoặc chưa trả về entitlement. Vui lòng thử lại sau." />
  if (entitlementState === 'loading') return <StatusPage kind="loading" title="Đang tải quyền truy cập" />
  return <Outlet />
}

function DefaultRedirect() {
  const user = useAuthStore((state) => state.user)
  return user ? <Navigate to={defaultRouteForUser(user)} replace /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route path="/qr/:publicOrderToken" element={<QrMenuPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<RequireRole roles={['SUPER_ADMIN']} />}>
          <Route path="/admin" element={<AdminShell />}>
            <Route path="dashboard" element={<DashboardPage portal="admin" />} />
            <Route element={<RequirePermission permission="PACKAGE_VIEW" />}>
              <Route path="packages" element={<PlaceholderPage title="Packages" description="Quản lý package sẽ được triển khai trong Phase 2." />} />
              <Route path="features" element={<PlaceholderPage title="Features" description="Quản lý feature sẽ được triển khai trong Phase 2." />} />
            </Route>
            <Route element={<RequirePermission permission="SUBSCRIPTION_VIEW" />}>
              <Route path="subscriptions" element={<PlaceholderPage title="Subscriptions" description="Quản lý subscription sẽ được triển khai trong Phase 2." />} />
            </Route>
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>
        </Route>

        <Route element={<RequireTenant />}>
          <Route element={<TenantPortal />}>
            <Route element={<RequireRole roles={['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN']} />}>
              <Route path="/cashier" element={<CashierShell />}>
                <Route path="dashboard" element={<DashboardPage portal="cashier" />} />
                <Route element={<RequireFeature feature="POS_QUICK_ORDER" />}><Route path="pos" element={<PlaceholderPage title="POS Quick Order" description="POS và order flow sẽ được triển khai trong Phase 2." />} /></Route>
                <Route path="orders" element={<PlaceholderPage title="Orders" description="Order management sẽ được triển khai trong Phase 2." />} />
                <Route path="kitchen" element={<PlaceholderPage title="Kitchen" description="Kitchen display sẽ được triển khai trong Phase 2." />} />
                <Route index element={<DefaultRedirect />} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="/subscription-required" element={<StatusPage kind="subscription" title="Subscription chưa hoạt động" description="Nhà hàng chưa có subscription đang hoạt động. Vui lòng liên hệ quản trị viên để tiếp tục." />} />
        <Route path="/access-unavailable" element={<StatusPage kind="unavailable" title="Quyền truy cập chưa sẵn sàng" description="Gói dịch vụ hiện tại chưa kích hoạt quyền truy cập cho tài khoản này." />} />
        <Route path="/forbidden" element={<StatusPage kind="forbidden" title="Bạn không có quyền truy cập" description="Tài khoản hiện tại không được phép mở trang này." />} />
      </Route>

      <Route path="/" element={<DefaultRedirect />} />
      <Route path="*" element={<StatusPage kind="not-found" title="Không tìm thấy trang" description="Đường dẫn này không tồn tại trong POS SaaS." />} />
    </Routes>
  )
}
