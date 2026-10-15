import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../features/auth/store/authStore'
import { useOrderAccess } from '../../features/order/hooks/useOrderAccess'
import { canOrder } from '../../features/order/policies/orderAccessPolicy'
import { useDraftNavigationGuard } from '../../features/order/hooks/useDraftNavigationGuard'
import '../../features/order/order.css'

export function CashierShell() {
  useDraftNavigationGuard()
  const { access, scope } = useOrderAccess()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const signOut = useAuthStore((state) => state.signOut)
  const isPos = location.pathname.startsWith('/cashier/pos')

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('pos_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('pos_sidebar_collapsed', String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  const roleLabel =
    user?.role === 'OWNER'
      ? 'Chủ quán'
      : user?.role === 'MANAGER'
        ? 'Quản lý'
        : user?.role === 'CASHIER'
          ? 'Thu ngân'
          : user?.role === 'KITCHEN'
            ? 'Bếp'
            : user?.role === 'WAITER'
              ? 'Phục vụ'
              : (user?.role ?? '')

  const avatarLetter = (user?.name || user?.role || 'U').trim().charAt(0).toUpperCase()

  const links = [
    { to: '/cashier/dashboard', label: 'Tổng quan', visible: true },
    { to: '/cashier/pos', label: 'Gọi món', visible: canOrder(access, 'ORDER_CREATE') },
    { to: '/cashier/orders', label: 'Đơn hàng', visible: canOrder(access, 'ORDER_VIEW') },
    { to: '/cashier/kitchen', label: 'Bếp', visible: ['OWNER', 'MANAGER', 'KITCHEN'].includes(user?.role ?? '') },
  ]

  return (
    <div
      className={`app-shell cashier-shell ${isPos ? 'is-pos-fullscreen' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
    >
      {!isPos && (
        <aside className="sidebar">
          <NavLink className="brand" to="/cashier/dashboard">
            <span className="brand-mark">P</span>
            <span>
              <strong>POS SaaS</strong>
              <small>{user?.restaurantName ?? 'Restaurant portal'}</small>
            </span>
          </NavLink>
          <div className="nav-label">Operations</div>
          <nav className="nav-list">
            {links
              .filter((l) => l.visible)
              .map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => 'nav-link ' + (isActive ? 'active' : '')}
                >
                  <span>{link.label}</span>
                  <span>›</span>
                </NavLink>
              ))}
          </nav>
          <div className="sidebar-footer">
            <span className="muted">{user?.role}</span>
          </div>
        </aside>
      )}
      <div className="main-area">
        {!isPos && (
          <header className="topbar pos-shell-topbar">
            <div className="pos-topbar-left">
              <button
                type="button"
                className="pos-sidebar-toggle-btn"
                onClick={toggleSidebar}
                title={sidebarCollapsed ? 'Hiện thanh menu' : 'Ẩn thanh menu'}
                aria-label={sidebarCollapsed ? 'Hiện thanh menu' : 'Ẩn thanh menu'}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="15" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                  {sidebarCollapsed ? (
                    <polyline points="18 9 21 12 18 15" />
                  ) : (
                    <polyline points="6 9 3 12 6 15" />
                  )}
                </svg>
              </button>
            </div>

            <div className="pos-topbar-right">
              <div className="pos-user-profile">
                <div className="pos-user-avatar" title={user?.name ?? 'User'}>
                  {avatarLetter}
                </div>
                <div className="pos-user-details">
                  <span className="pos-user-name">{user?.name ?? 'Người dùng'}</span>
                  <span className="pos-user-role">{roleLabel}</span>
                </div>
              </div>
              <button
                className="button button-ghost button-small pos-logout-btn"
                type="button"
                onClick={async () => {
                  await signOut()
                  navigate('/login', { replace: true })
                }}
              >
                Đăng xuất
              </button>
            </div>
          </header>
        )}
        <main className={`content ${isPos ? 'pos-content-fullscreen' : ''}`}>
          <div key={`${scope ?? ''}:${location.pathname}`} className="pos-page-transition">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
