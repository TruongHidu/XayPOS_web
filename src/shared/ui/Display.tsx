import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary'

/** Small coloured label for statuses (Đang bán, Hết món, Đã khóa…). */
export function StatusBadge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>
}

/** KPI tile: label, big value, optional hint/trend and icon. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'primary',
  loading,
  onClick,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: IconName
  tone?: Tone
  loading?: boolean
  onClick?: () => void
}) {
  const content = (
    <>
      <div className="ui-stat-head">
        <span className="ui-stat-label">{label}</span>
        {icon && (
          <span className={`ui-stat-icon ui-tone-${tone}`}>
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <strong className="ui-stat-value">{loading ? <span className="ui-stat-skeleton" aria-label="Đang tải" /> : value}</strong>
      {hint && <span className="ui-stat-hint">{hint}</span>}
    </>
  )
  return onClick ? (
    <button type="button" className="ui-stat ui-stat-clickable" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="ui-stat">{content}</div>
  )
}

export function KpiGrid({ children, columns = 4 }: { children: ReactNode; columns?: 2 | 3 | 4 }) {
  return <div className={`ui-kpi-grid ui-kpi-${columns}`}>{children}</div>
}

/** Page title row used by every management page. */
export function PageTitle({
  title,
  description,
  actions,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="ui-page-title">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </div>
  )
}

/** White card with optional header, the building block of management pages. */
export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className ? `ui-panel ${className}` : 'ui-panel'}>
      {(title || actions) && (
        <header className="ui-panel-header">
          {title && <h2>{title}</h2>}
          {actions && <div className="ui-panel-actions">{actions}</div>}
        </header>
      )}
      <div className="ui-panel-body">{children}</div>
    </section>
  )
}

/** Inline notice (info / warning / danger) inside a page. */
export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title?: string; children: ReactNode }) {
  return (
    <div className={`ui-notice ui-notice-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={tone === 'info' ? 'info' : tone === 'success' ? 'check' : 'warning'} size={18} />
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  )
}
