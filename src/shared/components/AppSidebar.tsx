import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { BrandMark } from './BrandMark'

export type SidebarIconName =
  | 'dashboard'
  | 'order'
  | 'pos'
  | 'kitchen'
  | 'package'
  | 'feature'
  | 'store'
  | 'subscription'
  | 'audit'
  | 'logout'

const iconPaths: Record<SidebarIconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  order: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </>
  ),
  pos: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <line x1="8" y1="20" x2="16" y2="20" />
      <line x1="12" y1="16" x2="12" y2="20" />
    </>
  ),
  kitchen: (
    <>
      <path d="M6 13.9A4 4 0 0 1 7 6a5 5 0 0 1 10 0 4 4 0 0 1 1 7.9V20H6z" />
      <line x1="6" y1="17" x2="18" y2="17" />
    </>
  ),
  package: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="M3 8l9 5 9-5" />
      <line x1="12" y1="13" x2="12" y2="21" />
    </>
  ),
  feature: (
    <>
      <polygon points="12 2 15 9 22 9 16.5 13.5 18.5 21 12 16.5 5.5 21 7.5 13.5 2 9 9 9" />
    </>
  ),
  store: (
    <>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M5 11v10h14V11" />
      <path d="M10 21v-5h4v5" />
    </>
  ),
  subscription: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </>
  ),
  audit: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="14 3 14 9 20 9" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
}

export function SidebarIcon({ name }: { name: SidebarIconName }) {
  return (
    <svg
      className="sb-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  )
}

export interface SidebarLink {
  to: string
  label: string
  icon: SidebarIconName
  visible?: boolean
  badge?: number
}

export interface SidebarSection {
  title: string
  links: SidebarLink[]
}

interface AppSidebarProps {
  homeTo: string
  subtitle: string
  userName: string
  userMeta: string
  roleBadge: string
  sections: SidebarSection[]
  onSignOut: () => void
}

export function AppSidebar({ homeTo, subtitle, userName, userMeta, roleBadge, sections, onSignOut }: AppSidebarProps) {
  const avatarLetter = (userName || 'U').trim().charAt(0).toUpperCase()
  const visibleSections = sections
    .map((section) => ({ ...section, links: section.links.filter((link) => link.visible !== false) }))
    .filter((section) => section.links.length > 0)

  return (
    <aside className="sidebar">
      <NavLink className="brand" to={homeTo}>
        <BrandMark className="brand-mark" />
        <span>
          <strong>Xây POS</strong>
          <small>{subtitle}</small>
        </span>
      </NavLink>

      <div className="sb-user">
        <span className="sb-user-avatar">{avatarLetter}</span>
        <span className="sb-user-info">
          <strong>{userName}</strong>
          <small>{userMeta}</small>
        </span>
        {roleBadge && <span className="sb-role-badge">{roleBadge}</span>}
      </div>

      <nav className="sb-nav">
        {visibleSections.map((section) => (
          <div key={section.title} className="sb-section">
            <div className="nav-label">{section.title}</div>
            <div className="nav-list">
              {section.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => 'nav-link ' + (isActive ? 'active' : '')}
                >
                  <SidebarIcon name={link.icon} />
                  <span className="sb-link-label">{link.label}</span>
                  {link.badge ? <span className="sb-badge">{link.badge}</span> : null}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="sb-logout" type="button" onClick={onSignOut}>
          <SidebarIcon name="logout" />
          <span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  )
}
