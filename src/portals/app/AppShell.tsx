import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../features/auth/store/authStore'
import { useDraftNavigationGuard } from '../../features/order/hooks/useDraftNavigationGuard'
import '../../features/order/order.css'
import { RealtimeIndicator } from './RealtimeIndicator'
import { AppSidebar, type SidebarSection } from '../../shared/components/AppSidebar'
import { useTenantAccess } from '../../shared/access/useTenantAccess'
import { Icon } from '../../shared/ui/Icon'
import { Toaster } from '../../shared/ui/Toaster'
import { LoadingSkeleton } from '../../shared/components/AdminUi'
import { readySections, sectionForPath, sectionGroups, sectionPath, type ReadySection } from './sections'
import { roleLabel } from '../../shared/utils/roleLabels'
import { PHONE_QUERY, useMediaQuery } from '../../shared/ui/useMediaQuery'

const SIDEBAR_KEY = 'pos_sidebar_collapsed'

/** Calls every ready section's badge hook in registry order (stable hook order). */
function useSectionBadges(): Record<string, number | undefined> {
  const badges: Record<string, number | undefined> = {}
  for (const section of readySections) {
    if (section.useBadge) badges[section.id] = section.useBadge()
  }
  return badges
}

function buildSidebar(canSee: (section: ReadySection) => boolean, badges: Record<string, number | undefined>) {
  return sectionGroups.map<SidebarSection>((group) => ({
    title: group.title,
    collapsible: true,
    links: readySections
      .filter((section) => section.group === group.id)
      .map((section) => ({
        to: sectionPath(section),
        label: section.label,
        icon: section.icon,
        visible: canSee(section),
        badge: badges[section.id],
        activePatterns: section.routes.map((route) => `/app/${route.path}`),
      })),
  }))
}

export function AppShell() {
  useDraftNavigationGuard()
  const { access, scope } = useTenantAccess()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const signOut = useAuthStore((state) => state.signOut)
  const badges = useSectionBadges()
  const current = sectionForPath(location.pathname)
  const isFullScreen = !!current?.fullScreen

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'true'
    } catch {
      return false
    }
  })

  // Phones get a slide-in drawer instead of a sidebar that eats the screen width.
  const isPhone = useMediaQuery(PHONE_QUERY)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerPath, setDrawerPath] = useState(location.pathname)
  if (drawerPath !== location.pathname) {
    // Navigating closes the drawer.
    setDrawerPath(location.pathname)
    setDrawerOpen(false)
  }
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])
  const menuOpen = isPhone ? drawerOpen : !sidebarCollapsed

  const toggleSidebar = () => {
    if (isPhone) {
      setDrawerOpen((open) => !open)
      return
    }
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_KEY, String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  const role = roleLabel(user?.role)
  const avatarLetter = (user?.name || user?.role || 'U').trim().charAt(0).toUpperCase()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const sections = buildSidebar((section) => section.canSee(access), badges)

  return (
    <div
      className={`app-shell cashier-shell ${isFullScreen ? 'is-pos-fullscreen' : ''} ${!isPhone && sidebarCollapsed ? 'sidebar-collapsed' : ''} ${isPhone && drawerOpen ? 'sidebar-drawer-open' : ''}`}
    >
      {isPhone && drawerOpen && !isFullScreen && (
        <div className="sb-backdrop" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
      )}
      {!isFullScreen && (
        <AppSidebar
          homeTo="/app/home"
          subtitle="Restaurant Pro"
          userName={user?.name ?? 'Người dùng'}
          userMeta={user?.restaurantName ?? role}
          roleBadge={user?.role ?? ''}
          sections={sections}
          onSignOut={() => void handleSignOut()}
        />
      )}
      <div className="main-area">
        <RealtimeIndicator />
        {!isFullScreen && (
          <header className="topbar pos-shell-topbar">
            <div className="pos-topbar-left">
              <button
                type="button"
                className="pos-sidebar-toggle-btn"
                onClick={toggleSidebar}
                title={menuOpen ? 'Ẩn thanh menu' : 'Hiện thanh menu'}
                aria-label={menuOpen ? 'Ẩn thanh menu' : 'Hiện thanh menu'}
                aria-expanded={menuOpen}
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
                  aria-hidden="true"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="15" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                  {menuOpen ? <polyline points="6 9 3 12 6 15" /> : <polyline points="18 9 21 12 18 15" />}
                </svg>
              </button>
              {current && (
                <div className="app-topbar-title">
                  <Icon name={current.icon} size={18} />
                  <span>{current.label}</span>
                </div>
              )}
            </div>

            <div className="pos-topbar-right">
              <div className="pos-user-profile">
                <div className="pos-user-avatar" title={user?.name ?? 'User'}>
                  {avatarLetter}
                </div>
                <div className="pos-user-details">
                  <span className="pos-user-name">{user?.name ?? 'Người dùng'}</span>
                  <span className="pos-user-role">{role}</span>
                </div>
              </div>
            </div>
          </header>
        )}
        <main className={`content ${isFullScreen ? 'pos-content-fullscreen' : ''}`}>
          <div key={`${scope ?? ''}:${location.pathname}`} className="pos-page-transition">
            <Suspense fallback={<LoadingSkeleton rows={6} />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  )
}
