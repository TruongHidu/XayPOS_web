import { useState } from 'react'
import { NavLink, matchPath, useLocation } from 'react-router-dom'
import { BrandMark } from './BrandMark'
import { Icon, type IconName } from '../ui/Icon'

export type SidebarIconName = IconName

export function SidebarIcon({ name }: { name: SidebarIconName }) {
  return <Icon name={name} className="sb-icon" />
}

export interface SidebarLink {
  to: string
  label: string
  icon: SidebarIconName
  visible?: boolean
  badge?: number
  /** Extra path patterns that keep this link highlighted (e.g. detail pages). */
  activePatterns?: string[]
}

export interface SidebarSection {
  title: string
  links: SidebarLink[]
  /** Lets the user fold the group; it always opens while one of its links is active. */
  collapsible?: boolean
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

const COLLAPSED_KEY = 'pos_sidebar_groups_collapsed'

function readCollapsed(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function AppSidebar({ homeTo, subtitle, userName, userMeta, roleBadge, sections, onSignOut }: AppSidebarProps) {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed)
  const avatarLetter = (userName || 'U').trim().charAt(0).toUpperCase()
  const visibleSections = sections
    .map((section) => ({ ...section, links: section.links.filter((link) => link.visible !== false) }))
    .filter((section) => section.links.length > 0)

  const isLinkActive = (link: SidebarLink) =>
    [link.to.split('?')[0], ...(link.activePatterns ?? [])].some(
      (pattern) => matchPath({ path: pattern, end: false }, location.pathname) !== null,
    )

  const toggle = (title: string) =>
    setCollapsed((current) => {
      const next = current.includes(title) ? current.filter((item) => item !== title) : [...current, title]
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
      } catch {
        // Storage may be unavailable (private mode); folding still works for this page.
      }
      return next
    })

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
        {visibleSections.map((section) => {
          const containsActive = section.links.some(isLinkActive)
          const open = !section.collapsible || containsActive || !collapsed.includes(section.title)
          const listId = `sb-group-${section.title.replace(/\W+/g, '-')}`
          return (
            <div key={section.title} className="sb-section">
              {section.collapsible ? (
                <button
                  type="button"
                  className="nav-label sb-group-toggle"
                  aria-expanded={open}
                  aria-controls={listId}
                  disabled={containsActive}
                  onClick={() => toggle(section.title)}
                >
                  <span>{section.title}</span>
                  {!containsActive && <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />}
                </button>
              ) : (
                <div className="nav-label">{section.title}</div>
              )}
              {open && (
                <div className="nav-list" id={listId}>
                  {section.links.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      title={link.label}
                      className={() => 'nav-link ' + (isLinkActive(link) ? 'active' : '')}
                      aria-current={isLinkActive(link) ? 'page' : undefined}
                    >
                      <SidebarIcon name={link.icon} />
                      <span className="sb-link-label">{link.label}</span>
                      {link.badge ? (
                        <span className="sb-badge" aria-label={`${link.badge} mục cần xử lý`}>
                          {link.badge > 99 ? '99+' : link.badge}
                        </span>
                      ) : null}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
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
