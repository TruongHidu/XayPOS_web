import { useAuthStore } from '../features/auth/store/authStore'

export function DashboardPage({ portal }: { portal: 'admin' | 'cashier' }) {
  const user = useAuthStore((state) => state.user)
  return <><section className="card hero-card"><div className="eyebrow">{portal === 'admin' ? 'System overview' : 'Today at a glance'}</div><h2>{portal === 'admin' ? 'Chào mừng trở lại, quản trị viên.' : `Xin chào ${user?.name ?? ''}.`}</h2><p className="muted">{portal === 'admin' ? 'Các module quản lý package, feature và subscription đang sẵn sàng cho Phase 2.' : 'Shell vận hành đã sẵn sàng. POS, order, kitchen và payment sẽ được kết nối ở Phase 2.'}</p></section><div className="metric-grid"><div className="card metric"><span className="eyebrow">Portal</span><strong>{portal === 'admin' ? 'ADMIN' : 'POS'}</strong><span className="muted">Phase 1 shell</span></div><div className="card metric"><span className="eyebrow">Security</span><strong>JWT</strong><span className="muted">Refresh rotation enabled</span></div><div className="card metric"><span className="eyebrow">Status</span><strong>Ready</strong><span className="muted">Backend API pending</span></div></div></>
}

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return <section className="card hero-card"><div className="eyebrow">Phase 2 placeholder</div><h2>{title}</h2><p className="muted">{description}</p></section>
}
