import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { StatusPage } from '../../shared/components/StatusPage'
import { useTenantAccess } from '../../shared/access/useTenantAccess'
import { homePathFor, type ReadySection } from './sections'

/** Default guard: open the section when `canSee`, otherwise fall back to the user's home. */
export function SectionGuard({ section }: { section: ReadySection }) {
  const { access } = useTenantAccess()
  if (access.entitlementState === 'loading') return <StatusPage kind="loading" title="Đang kiểm tra quyền truy cập" />
  if (section.canSee(access)) return <Outlet />
  return <Navigate to={homePathFor(access) ?? '/forbidden'} replace />
}

/** `/app` and `/app/home`: the first section this user may open, in sidebar order. */
export function PortalHome() {
  const { access } = useTenantAccess()
  if (access.entitlementState === 'loading') return <StatusPage kind="loading" title="Đang tải quyền truy cập" />
  const home = homePathFor(access)
  if (home) return <Navigate to={home} replace />
  return (
    <section className="card hero-card">
      <div className="eyebrow">Không có chức năng khả dụng</div>
      <h2>Tài khoản chưa được cấp chức năng nào trên web</h2>
      <p className="muted">
        Gói dịch vụ hoặc quyền của tài khoản hiện chưa mở chức năng nào. Vui lòng liên hệ chủ quán hoặc quản lý.
      </p>
    </section>
  )
}

/** Old `/cashier/*` links (bookmarks, printed guides) keep working. */
export function LegacyCashierRedirect() {
  const { '*': rest = '' } = useParams()
  const location = useLocation()
  const target = rest.startsWith('orders')
    ? `/app/${rest}`
    : rest === 'pos' || rest.startsWith('pos/')
      ? '/app/order-create'
      : '/app/home'
  return <Navigate to={target + location.search} replace />
}
