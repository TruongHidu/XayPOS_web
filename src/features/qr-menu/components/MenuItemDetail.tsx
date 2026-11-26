import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { PublicMenuItem } from '../types'
import { formatMenuPrice } from '../utils/formatMenuPrice'

interface MenuItemDetailProps {
  item: PublicMenuItem
  currencyCode: string
  onClose: () => void
  /** The ordering controls; rendered in the sheet's footer so they never scroll away. */
  children?: ReactNode
}

/** Pulling the sheet down this far (px) closes it. */
const SWIPE_CLOSE = 90

/**
 * Dish sheet: a bottom sheet on phones, a dialog on wider screens. It closes on
 * a tap outside, Esc, the close button, or by swiping the top part down; the
 * ordering controls stay pinned at the bottom.
 */
export function MenuItemDetail({ item, currencyCode, onClose, children }: MenuItemDetailProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; dy: number } | null>(null)
  const [offset, setOffset] = useState(0)
  const [imgError, setImgError] = useState(false)
  const isOutOfStock = item.availabilityStatus === 'OUT_OF_STOCK'
  const showImage = !!item.imageUrl && !imgError

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('[data-close-btn]')?.focus()
    // Keep the menu behind the sheet from scrolling.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        ) ?? [],
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
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [onClose])

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    drag.current = { startY: event.clientY, dy: 0 }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    drag.current.dy = Math.max(0, event.clientY - drag.current.startY)
    setOffset(drag.current.dy)
  }
  const endDrag = () => {
    if (!drag.current) return
    const { dy } = drag.current
    drag.current = null
    if (dy > SWIPE_CLOSE) onClose()
    else setOffset(0)
  }

  return (
    <div
      className="qr-menu-detail-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="qr-menu-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-menu-detail-title"
        ref={dialogRef}
        style={offset ? { transform: `translateY(${offset}px)`, transition: 'none' } : undefined}
      >
        <button className="qr-menu-detail-close" type="button" onClick={onClose} aria-label="Đóng" data-close-btn>
          <span aria-hidden="true">✕</span>
        </button>
        <div
          className="qr-menu-detail-drag"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="qr-menu-detail-grabber" aria-hidden="true" />
          {showImage && (
            <img
              className="qr-menu-detail-img"
              src={item.imageUrl!}
              alt={item.name}
              referrerPolicy="no-referrer"
              draggable={false}
              onError={() => setImgError(true)}
            />
          )}
        </div>
        <div className="qr-menu-detail-body">
          <h2 id="qr-menu-detail-title">{item.name}</h2>
          <div className="qr-menu-detail-price">
            {formatMenuPrice(item.salePrice, currencyCode)}
            {item.baseUnit && <span className="qr-menu-detail-unit">/{item.baseUnit}</span>}
            {isOutOfStock && <span className="qr-menu-item-badge-oos qr-menu-detail-oos-badge">Hết hàng</span>}
          </div>
          {item.group && <div className="qr-menu-detail-group">{item.group.name}</div>}
          {item.description && <p className="qr-menu-detail-desc">{item.description}</p>}
        </div>
        {children && <div className="qr-menu-detail-footer">{children}</div>}
      </div>
    </div>
  )
}
