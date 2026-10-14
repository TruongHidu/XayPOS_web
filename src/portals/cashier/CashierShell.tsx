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

  const links = [
    { to: '/cashier/dashboard', label: 'Tổng quan', visible: true },
    { to: '/cashier/pos', label: 'Gọi món', visible: canOrder(access, 'ORDER_CREATE') },
    { to: '/cashier/orders', label: 'Đơn hàng', visible: canOrder(access, 'ORDER_VIEW') },
    { to: '/cashier/kitchen', label: 'Bếp', visible: ['OWNER', 'MANAGER', 'KITCHEN'].includes(user?.role ?? '') },
  ]

  return (
    <div className={`app-shell cashier-shell ${isPos ? 'is-pos-fullscreen' : ''}`}>
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
          <header className="topbar">
            <div>
              <div className="eyebrow">{user?.restaurantCode ?? 'Restaurant'}</div>
              <h1>{user?.restaurantName ?? 'Cashier portal'}</h1>
            </div>
            <div className="user-chip">
              <span>{user?.name}</span>
              <button
                className="button button-ghost"
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
          <div key={scope}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
