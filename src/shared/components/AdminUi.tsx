import { useEffect, useRef, type PropsWithChildren, type ReactNode } from 'react'
import { normalizeApiError } from '../errors/normalizeApiError'

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="skeleton-stack" aria-label="Đang tải" role="status">{Array.from({ length: rows }, (_, index) => <div className="skeleton-row" key={index} />)}</div>
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><div className="empty-icon">○</div><h3>{title}</h3><p className="muted">{description}</p></div>
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const normalized = normalizeApiError(error)
  const title = normalized.status === 404 || normalized.code.endsWith('_NOT_FOUND') ? 'Không tìm thấy dữ liệu' : 'Không thể tải dữ liệu'
  return <div className="error-state" role="alert"><strong>{title}</strong><p>{normalized.message}</p><button className="button button-ghost dark-button" type="button" onClick={onRetry}>Thử lại</button></div>
}

export function Modal({ title, children, onClose }: PropsWithChildren<{ title: string; onClose: () => void }>) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const firstControl = dialogRef.current?.querySelector<HTMLElement>('input, select, textarea, button')
    firstControl?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus() }
  }, [onClose])
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={dialogRef}><div className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Đóng">×</button></div>{children}</div></div>
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2><p className="muted">{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>
}

export function Toast({ message, tone = 'success' }: { message: string; tone?: 'success' | 'error' }) {
  return <div className={`toast toast-${tone}`} role="status">{message}</div>
}

export function FieldError({ message }: { message?: string }) { return message ? <span className="field-error">{message}</span> : null }

export function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null
  return <div className="pagination"><button className="button button-small button-ghost" type="button" disabled={page === 0} onClick={() => onPageChange(page - 1)}>← Trước</button><span>Trang {page + 1} / {totalPages}</span><button className="button button-small button-ghost" type="button" disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}>Sau →</button></div>
}

export function SortButton({ label, active, direction, onClick }: { label: string; active: boolean; direction: 'asc' | 'desc'; onClick: () => void }) {
  return <button className={`sort-button ${active ? 'sort-active' : ''}`} type="button" onClick={onClick}>{label}{active ? direction === 'asc' ? ' ↑' : ' ↓' : ''}</button>
}
