import { useId, useRef, type PropsWithChildren, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { useDialogFocus } from './useDialogFocus'

/**
 * Right-side panel for create/edit forms and detail views. Keeps the list
 * visible behind it, which suits management screens better than a centered modal.
 */
export function Drawer({
  title,
  subtitle,
  onClose,
  footer,
  width = 'md',
  children,
}: PropsWithChildren<{
  title: string
  subtitle?: string
  onClose: () => void
  /** Sticky action bar (Save / Cancel). */
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}>) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogFocus(ref, onClose)
  const node = (
    <div
      className="ui-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside className={`ui-drawer ui-drawer-${width}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <header className="ui-drawer-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <button type="button" className="ui-icon-button" aria-label="Đóng" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="ui-drawer-body">{children}</div>
        {footer && <footer className="ui-drawer-footer">{footer}</footer>}
      </aside>
    </div>
  )
  return typeof document !== 'undefined' ? createPortal(node, document.body) : node
}
