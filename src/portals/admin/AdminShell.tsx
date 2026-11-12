import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '../../features/admin/api/adminKeys'
import { adminPaymentEventsApi } from '../../features/admin/api/adminPaymentsApi'
import { useAuthStore } from '../../features/auth/store/authStore'
import { AppSidebar, type SidebarSection } from '../../shared/components/AppSidebar'

export function AdminShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const signOut = useAuthStore((state) => state.signOut)
  const canViewDashboard = Boolean(user?.permissions.includes('ADMIN_DASHBOARD_VIEW'))
  const canViewCatalog = Boolean(user?.permissions.includes('PACKAGE_VIEW'))
  const canViewRestaurants = Boolean(user?.permissions.includes('RESTAURANT_VIEW'))
  const canViewSubscriptions = Boolean(user?.permissions.includes('SUBSCRIPTION_VIEW'))
  const canViewAudit = Boolean(user?.permissions.includes('AUDIT_VIEW'))
  const canReviewPayments = Boolean(user?.permissions.includes('SUBSCRIPTION_PAYMENT_REVIEW'))
  const reviewCounts = useQuery({
    queryKey: adminKeys.paymentReviewCounts(),
    queryFn: adminPaymentEventsApi.counts,
    enabled: canReviewPayments,
    refetchInterval: 60_000,
    retry: false,
  })
  const pendingReviews = (reviewCounts.data?.paymentEvents ?? 0) + (reviewCounts.data?.purchases ?? 0)
  const sections: SidebarSection[] = [
    {
      title: 'Tổng quan',
      links: [{ to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard', visible: canViewDashboard }],
    },
    {
      title: 'Danh mục gói',
      links: [
        { to: '/admin/packages', label: 'Packages', icon: 'package', visible: canViewCatalog },
        { to: '/admin/features', label: 'Features', icon: 'feature', visible: canViewCatalog },
      ],
    },
    {
      title: 'Khách hàng',
      links: [
        { to: '/admin/restaurants', label: 'Restaurants', icon: 'store', visible: canViewRestaurants },
        { to: '/admin/subscriptions', label: 'Subscriptions', icon: 'subscription', visible: canViewSubscriptions },
      ],
    },
    {
      title: 'Thanh toán',
      links: [
        {
          to: '/admin/payment-reviews',
          label: 'Đối soát chuyển khoản',
          icon: 'payment',
          visible: canReviewPayments,
          badge: pendingReviews > 0 ? pendingReviews : undefined,
        },
        { to: '/admin/purchases', label: 'Đơn mua gói', icon: 'receipt', visible: canViewSubscriptions },
      ],
    },
    {
      title: 'Hệ thống',
      links: [{ to: '/admin/audit-logs', label: 'Audit logs', icon: 'audit', visible: canViewAudit }],
    },
  ]
  const handleSignOut = async () => { await signOut(); navigate('/login', { replace: true }) }
  return (
    <div className="app-shell">
      <AppSidebar
        homeTo="/admin/dashboard"
        subtitle="System Admin"
        userName={user?.name ?? 'Admin'}
        userMeta={user?.email ?? ''}
        roleBadge="ADMIN"
        sections={sections}
        onSignOut={() => void handleSignOut()}
      />
      <div className="main-area">
        <header className="topbar">
          <div>
            <div className="eyebrow">System Admin</div>
            <h1>Control center</h1>
          </div>
          <div className="user-chip">
            <span>{user?.name}</span>
            <span className="avatar">{user?.name.charAt(0).toUpperCase()}</span>
          </div>
        </header>
        <main className="content">
          <div key={location.pathname} className="pos-page-transition">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
