import type { PublicQrMenuError } from '../types'

interface QrMenuStatusProps {
  error: PublicQrMenuError
  onRetry?: () => void
  onResetFilters?: () => void
}

/**
 * QR-specific error/status display.
 * Does NOT link to "/" or login — keeps the customer on the QR page.
 */
export function QrMenuStatus({ error, onRetry, onResetFilters }: QrMenuStatusProps) {
  const icon =
    error.type === 'not_found' ? '🔍' :
    error.type === 'unavailable' ? '🔒' :
    error.type === 'validation' ? '⚠️' :
    error.type === 'network' ? '📡' :
    '⚠️'

  return (
    <div className="qr-menu-status" role="alert">
      <div className="qr-menu-status-icon" aria-hidden="true">{icon}</div>
      <p className="qr-menu-status-message">{error.message}</p>
      {error.type === 'validation' && onResetFilters && (
        <button className="qr-menu-status-btn" type="button" onClick={onResetFilters}>
          Xóa bộ lọc
        </button>
      )}
      {(error.type === 'network' || error.type === 'server') && onRetry && (
        <button className="qr-menu-status-btn" type="button" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  )
}

/** Empty state when no items match filters. */
export function QrMenuEmptySearch({ onResetFilters }: { onResetFilters: () => void }) {
  return (
    <div className="qr-menu-empty" role="status">
      <div className="qr-menu-empty-icon" aria-hidden="true">🔍</div>
      <p>Không tìm thấy món phù hợp.</p>
      <button className="qr-menu-status-btn" type="button" onClick={onResetFilters}>
        Xóa bộ lọc
      </button>
    </div>
  )
}

/** Empty state when the restaurant has no menu items at all. */
export function QrMenuEmptyMenu() {
  return (
    <div className="qr-menu-empty" role="status">
      <div className="qr-menu-empty-icon" aria-hidden="true">📋</div>
      <p>Nhà hàng chưa có món để hiển thị.</p>
    </div>
  )
}

/** Loading skeleton for the menu. */
export function QrMenuLoading() {
  return (
    <div className="qr-menu-loading" role="status" aria-label="Đang tải">
      <div className="qr-menu-loading-spinner" aria-hidden="true" />
      <p>Đang tải thực đơn...</p>
    </div>
  )
}
