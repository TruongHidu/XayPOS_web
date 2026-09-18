import { NavLink, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../features/auth/store/authStore'

export function AdminShell() {
  const user = useAuthStore((state) => state.user)
  const signOut = useAuthStore((state) => state.signOut)
  const canViewDashboard = Boolean(user?.permissions.includes('ADMIN_DASHBOARD_VIEW'))
  const canViewCatalog = Boolean(user?.permissions.includes('PACKAGE_VIEW'))
  const canViewRestaurants = Boolean(user?.permissions.includes('RESTAURANT_VIEW'))
  const canViewSubscriptions = Boolean(user?.permissions.includes('SUBSCRIPTION_VIEW'))
  const canViewAudit = Boolean(user?.permissions.includes('AUDIT_VIEW'))
  const links = [
    { to: '/admin/dashboard', label: 'Dashboard', visible: canViewDashboard },
    { to: '/admin/packages', label: 'Packages', visible: canViewCatalog },
    { to: '/admin/features', label: 'Features', visible: canViewCatalog },
    { to: '/admin/restaurants', label: 'Restaurants', visible: canViewRestaurants },
    { to: '/admin/subscriptions', label: 'Subscriptions', visible: canViewSubscriptions },
    { to: '/admin/audit-logs', label: 'Audit logs', visible: canViewAudit },
  ]
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href="/admin/dashboard"><span className="brand-mark">P</span><span><strong>POS SaaS</strong><small>System Admin</small></span></a><div className="nav-label">Workspace</div><nav className="nav-list">{links.filter((link) => link.visible).map((link) => <NavLink key={link.to} to={link.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span>{link.label}</span><span>›</span></NavLink>)}</nav><div className="sidebar-footer"><button className="button button-ghost" type="button" onClick={() => void signOut()}>Đăng xuất</button></div></aside><div className="main-area"><header className="topbar"><div><div className="eyebrow">System Admin</div><h1>Control center</h1></div><div className="user-chip"><span>{user?.name}</span><span className="avatar">{user?.name.charAt(0).toUpperCase()}</span></div></header><main className="content"><Outlet /></main></div></div>
}
