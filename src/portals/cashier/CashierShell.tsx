import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../features/auth/store/authStore'

export function CashierShell() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const signOut = useAuthStore((state) => state.signOut)
  const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER'
  const links = [{ to: '/cashier/dashboard', label: 'Tổng quan' }, { to: '/cashier/pos', label: 'POS', roles: ['OWNER', 'MANAGER', 'CASHIER'] }, { to: '/cashier/orders', label: 'Đơn hàng', roles: ['OWNER', 'MANAGER', 'CASHIER', 'WAITER'] }, { to: '/cashier/kitchen', label: 'Bếp', roles: ['OWNER', 'MANAGER', 'KITCHEN'] }]
  const handleSignOut = async () => { await signOut(); navigate('/login', { replace: true }) }
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href="/cashier/dashboard"><span className="brand-mark">P</span><span><strong>POS SaaS</strong><small>{user?.restaurantName ?? 'Restaurant portal'}</small></span></a><div className="nav-label">Operations</div><nav className="nav-list">{links.filter((link) => !link.roles || (user && link.roles.includes(user.role))).map((link) => <NavLink key={link.to} to={link.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span>{link.label}</span><span>›</span></NavLink>)}</nav><div className="sidebar-footer"><div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{canManage ? 'Quản lý nhà hàng' : `Vai trò: ${user?.role}`}</div><button className="button button-ghost" type="button" onClick={() => void handleSignOut()}>Đăng xuất</button></div></aside><div className="main-area"><header className="topbar"><div><div className="eyebrow">{user?.restaurantCode ?? 'Restaurant'}</div><h1>{user?.restaurantName ?? 'Cashier portal'}</h1></div><div className="user-chip"><span>{user?.name}</span><span className="avatar">{user?.name.charAt(0).toUpperCase()}</span></div></header><main className="content"><Outlet /></main></div></div>
}
