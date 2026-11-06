import type { NormalizedApiError } from '../../../shared/types/auth'
import { orderError } from '../utils/orderErrors'
export function OrderFeedback({
  error,
  onRetry,
  label = 'Tải lại để xác minh',
}: {
  error: unknown
  onRetry?: () => void
  label?: string
}) {
  if (!error) return null
  const f: NormalizedApiError =
    typeof error === 'object' && error !== null && 'isNetworkError' in error
      ? (error as NormalizedApiError)
      : orderError(error)
  return (
    <div className="order-feedback" role="alert">
      <strong>{f.message}</strong>
      {Object.entries(f.fieldErrors).map(([key, value]) => (
        <p key={key}>{value}</p>
      ))}
      {onRetry && (
        <button type="button" className="button button-ghost" onClick={onRetry}>
          {label}
        </button>
      )}
    </div>
  )
}
export function OrderPager({
  page,
  totalPages,
  loading,
  onPage,
}: {
  page: number
  totalPages: number
  loading?: boolean
  onPage: (page: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="order-pager">
      <button type="button" disabled={loading || page === 0} onClick={() => onPage(page - 1)}>
        ← Trước
      </button>
      <span>
        Trang {page + 1}/{totalPages}
      </span>
      <button type="button" disabled={loading || page + 1 >= totalPages} onClick={() => onPage(page + 1)}>
        Sau →
      </button>
    </div>
  )
}
