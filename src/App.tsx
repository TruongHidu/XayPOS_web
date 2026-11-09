import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { LoginPage } from './features/auth/pages/LoginPage'
import { RegisterPage } from './features/auth/pages/RegisterPage'
import { PublicOnlyRoute, RequireAuth, RequirePermission, RequireRole, RequireTenant } from './features/auth/guards'
import { useAuthStore } from './features/auth/store/authStore'
import { AuthBootstrap } from './features/auth/components/AuthBootstrap'
import { AdminShell } from './portals/admin/AdminShell'
import { CashierShell } from './portals/cashier/CashierShell'
import { StaffRealtimeBoundary } from './portals/cashier/StaffRealtimeBoundary'
import { ReceiptPrintingProvider } from './features/order/printing/ReceiptPrintingProvider'
import type { RealtimeRuntime } from './shared/realtime/runtime'
import { QrMenuPage } from './portals/qr-menu/QrMenuPage'
import { QrMenuLayout } from './portals/qr-menu/QrMenuLayout'
import { QrRequestPage } from './portals/qr-menu/QrRequestPage'
import { AdminDashboardPage } from './features/admin/pages/AdminDashboardPage'
import { FeaturePage } from './features/admin/pages/FeaturePage'
import { FeatureDetailPage } from './features/admin/pages/FeatureDetailPage'
import { PackageDetailPage } from './features/admin/pages/PackageDetailPage'
import { PackagePage } from './features/admin/pages/PackagePage'
import { SubscriptionPage } from './features/admin/pages/SubscriptionPage'
import { SubscriptionListPage, RestaurantSubscriptionListPage } from './features/admin/pages/SubscriptionListPage'
import { SubscriptionDetailPage } from './features/admin/pages/SubscriptionDetailPage'
import { RestaurantsPage } from './features/admin/pages/RestaurantsPage'
import { RestaurantDetailPage } from './features/admin/pages/RestaurantDetailPage'
import { AuditLogsPage } from './features/admin/pages/AuditLogsPage'
import { DashboardPage, PlaceholderPage } from './portals/portalPages'
import { StatusPage } from './shared/components/StatusPage'
import { defaultRouteForUser } from './shared/utils/routing'
import { OrderRuntimeBoundary } from './features/order/components/OrderRuntimeBoundary'
import { OrderGuard } from './features/order/components/OrderGuard'
import { CashierPosPage } from './features/order/pages/CashierPosPage'
import { OrderListPage } from './features/order/pages/OrderListPage'
import { OrderDetailPage } from './features/order/pages/OrderDetailPage'
import { LandingPage } from './features/marketing/pages/LandingPage'
import { OnboardingPage } from './features/onboarding/pages/OnboardingPage'
import { PurchasePage } from './features/onboarding/pages/PurchasePage'

function TenantPortal() {
  const user = useAuthStore((state) => state.user)
  const entitlementState = useAuthStore((state) => state.entitlementState)
  const location = useLocation()

  if (!user || user.restaurantId === null) return <Navigate to="/forbidden" replace />
  if (entitlementState === 'inactive') {
    const target =
      user.role === 'OWNER' ? '/onboarding' : user.role === 'MANAGER' ? '/subscription-required' : '/access-unavailable'
    // LoginPage navigates right after PublicOnlyRoute does. Without the key that second navigation
    // lands back here on an already-fired Navigate, which renders nothing and leaves a blank page.
    return <Navigate key={location.key} to={target} replace />
  }
  if (entitlementState === 'error')
    return (
      <StatusPage
        kind="network"
        title="Không thể tải quyền truy cập"
        description="Máy chủ không khả dụng hoặc chưa trả về entitlement. Vui lòng thử lại sau."
      />
    )
  if (entitlementState === 'loading') return <StatusPage kind="loading" title="Đang tải quyền truy cập" />
  return <Outlet />
}

function DefaultRedirect() {
  const user = useAuthStore((state) => state.user)
  return user ? <Navigate to={defaultRouteForUser(user)} replace /> : <Navigate to="/login" replace />
}

function AdminDefaultRedirect() {
  const permissions = useAuthStore((state) => state.user?.permissions ?? [])
  const route = permissions.includes('ADMIN_DASHBOARD_VIEW')
    ? '/admin/dashboard'
    : permissions.includes('RESTAURANT_VIEW')
      ? '/admin/restaurants'
      : permissions.includes('SUBSCRIPTION_VIEW')
        ? '/admin/subscriptions'
        : permissions.includes('PACKAGE_VIEW')
          ? '/admin/features'
          : permissions.includes('AUDIT_VIEW')
            ? '/admin/audit-logs'
            : '/forbidden'
  return <Navigate to={route} replace />
}

export default function App({ realtimeRuntime }: { realtimeRuntime?: RealtimeRuntime } = {}) {
  return (
    <Routes>
      {/* === LANDING — outside AuthBootstrap so visitors never see the session loading screen === */}
      <Route path="/" element={<LandingPage />} />

      {/* === PUBLIC QR MENU — outside AuthBootstrap === */}
      <Route element={<QrMenuLayout />}>
        <Route path="/qr/:qrToken" element={<QrMenuPage />} />
        <Route path="/menu/:menuToken" element={<QrMenuPage />} />
        <Route path="/qr/:qrToken/requests/:requestId" element={<QrRequestPage />} />
        <Route path="/menu/:menuToken/requests/:requestId" element={<QrRequestPage />} />
      </Route>

      {/* === AUTH BOUNDARY — bootstraps session for all non-QR routes === */}
      <Route
        element={
          <AuthBootstrap>
            <OrderRuntimeBoundary>
              <Outlet />
            </OrderRuntimeBoundary>
          </AuthBootstrap>
        }
      >
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<RequireRole roles={['SUPER_ADMIN']} />}>
            <Route path="/admin" element={<AdminShell />}>
              <Route element={<RequirePermission permission="ADMIN_DASHBOARD_VIEW" />}>
                <Route path="dashboard" element={<AdminDashboardPage />} />
              </Route>
              <Route element={<RequirePermission permission="PACKAGE_VIEW" />}>
                <Route path="packages" element={<PackagePage />} />
                <Route path="packages/:packageCode" element={<PackageDetailPage />} />
                <Route path="features" element={<FeaturePage />} />
                <Route path="features/:featureCode" element={<FeatureDetailPage />} />
              </Route>
              <Route element={<RequirePermission permission="RESTAURANT_VIEW" />}>
                <Route path="restaurants" element={<RestaurantsPage />} />
                <Route path="restaurants/:restaurantId" element={<RestaurantDetailPage />} />
              </Route>
              <Route element={<RequirePermission permission="SUBSCRIPTION_VIEW" />}>
                <Route path="subscriptions" element={<SubscriptionListPage />} />
                <Route path="restaurants/:restaurantId/subscriptions" element={<RestaurantSubscriptionListPage />} />
                <Route
                  path="restaurants/:restaurantId/subscriptions/:subscriptionId"
                  element={<SubscriptionDetailPage />}
                />
              </Route>
              <Route element={<RequirePermission permission="SUBSCRIPTION_MANAGE" />}>
                <Route path="subscriptions/operations" element={<SubscriptionPage />} />
              </Route>
              <Route element={<RequirePermission permission="AUDIT_VIEW" />}>
                <Route path="audit-logs" element={<AuditLogsPage />} />
              </Route>
              <Route index element={<AdminDefaultRedirect />} />
            </Route>
          </Route>

          <Route element={<RequireTenant />}>
            {/* Outside TenantPortal: these pages serve restaurants without an active subscription. */}
            <Route element={<RequireRole roles={['OWNER']} />}>
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/onboarding/purchases/:purchaseId" element={<PurchasePage />} />
            </Route>

            <Route element={<TenantPortal />}>
              <Route element={<RequireRole roles={['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN']} />}>
                <Route
                  path="/cashier"
                  element={
                    <StaffRealtimeBoundary runtime={realtimeRuntime}>
                      <ReceiptPrintingProvider>
                        <CashierShell />
                      </ReceiptPrintingProvider>
                    </StaffRealtimeBoundary>
                  }
                >
                  <Route path="dashboard" element={<DashboardPage portal="cashier" />} />
                  <Route element={<OrderGuard permission="ORDER_CREATE" />}>
                    <Route path="pos" element={<CashierPosPage />} />
                  </Route>
                  <Route element={<OrderGuard permission="ORDER_VIEW" />}>
                    <Route path="orders" element={<OrderListPage />} />
                    <Route path="orders/:orderId" element={<OrderDetailPage />} />
                  </Route>
                  <Route
                    path="kitchen"
                    element={
                      <PlaceholderPage
                        title="Kitchen"
                        description="Kitchen display sẽ được triển khai trong Phase 2."
                      />
                    }
                  />
                  <Route index element={<DefaultRedirect />} />
                </Route>
              </Route>
            </Route>
          </Route>

          <Route
            path="/subscription-required"
            element={
              <StatusPage
                kind="subscription"
                title="Nhà hàng chưa có gói hoạt động"
                description="Vui lòng liên hệ chủ quán để kích hoạt gói dịch vụ."
              />
            }
          />
          <Route
            path="/access-unavailable"
            element={
              <StatusPage
                kind="unavailable"
                title="Quyền truy cập chưa sẵn sàng"
                description="Gói dịch vụ hiện tại chưa kích hoạt quyền truy cập cho tài khoản này."
              />
            }
          />
          <Route
            path="/forbidden"
            element={
              <StatusPage
                kind="forbidden"
                title="Bạn không có quyền truy cập"
                description="Tài khoản hiện tại không được phép mở trang này."
              />
            }
          />
          <Route
            path="/403"
            element={
              <StatusPage
                kind="forbidden"
                title="Bạn không có quyền truy cập"
                description="Tài khoản hiện tại không được phép mở trang này."
              />
            }
          />
        </Route>

        <Route path="/app" element={<DefaultRedirect />} />
        <Route
          path="*"
          element={
            <StatusPage
              kind="not-found"
              title="Không tìm thấy trang"
              description="Đường dẫn này không tồn tại trong Xây POS."
            />
          }
        />
      </Route>
    </Routes>
  )
}
