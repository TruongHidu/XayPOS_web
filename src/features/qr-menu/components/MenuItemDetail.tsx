import { useEffect, useRef, useState } from 'react'
import type { PublicMenuItem } from '../types'
import { formatMenuPrice } from '../utils/formatMenuPrice'

interface MenuItemDetailProps {
  item: PublicMenuItem
  currencyCode: string
  onClose: () => void
}

const PLACEHOLDER_IMAGE = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="%23f0f4f8" width="400" height="300"/><text fill="%239fb3c8" font-family="sans-serif" font-size="60" text-anchor="middle" x="200" y="170">🍽</text></svg>'
)

export function MenuItemDetail({ item, currencyCode, onClose }: MenuItemDetailProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [imgError, setImgError] = useState(false)
  const isOutOfStock = item.availabilityStatus === 'OUT_OF_STOCK'
  const imgSrc = item.imageUrl && !imgError ? item.imageUrl : PLACEHOLDER_IMAGE

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    // Focus the close button
    const closeBtn = dialogRef.current?.querySelector<HTMLElement>('[data-close-btn]')
    closeBtn?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
        ) ?? []
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [onClose])

  return (
    <div
      className="qr-menu-detail-backdrop"
      role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="qr-menu-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-menu-detail-title"
        ref={dialogRef}
      >
        <div className="qr-menu-detail-header">
          <h2 id="qr-menu-detail-title">{item.name}</h2>
          <button
            className="qr-menu-detail-close"
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            data-close-btn
          >
            ×
          </button>
        </div>
        <div className="qr-menu-detail-body">
          <img
            className="qr-menu-detail-img"
            src={imgSrc}
            alt={item.name}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
          <div className="qr-menu-detail-info">
            <div className="qr-menu-detail-price">
              {formatMenuPrice(item.salePrice, currencyCode)}
              {item.baseUnit && <span className="qr-menu-detail-unit">/{item.baseUnit}</span>}
            </div>

            {isOutOfStock && (
              <span className="qr-menu-item-badge-oos qr-menu-detail-oos-badge">Hết hàng</span>
            )}

            {item.group && (
              <div className="qr-menu-detail-group">
                <span className="qr-menu-detail-label">Nhóm:</span> {item.group.name}
              </div>
            )}

            {item.description && (
              <p className="qr-menu-detail-desc">{item.description}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
