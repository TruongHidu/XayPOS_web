import { useState } from 'react'
import type { PublicMenuItem } from '../types'
import { formatMenuPrice } from '../utils/formatMenuPrice'

interface MenuItemCardProps {
  item: PublicMenuItem
  currencyCode: string
  onClick: () => void
  /** Adds one portion straight to the cart; omitted when ordering is off. */
  onQuickAdd?: () => void
  quickAddDisabled?: boolean
  /** Portions of this dish already in the cart. */
  inCart?: number
}

/**
 * One dish as a compact row: photo, name, short description, price. Tapping the
 * row opens the dish sheet; the round + adds one portion without opening it.
 */
export function MenuItemCard({
  item,
  currencyCode,
  onClick,
  onQuickAdd,
  quickAddDisabled,
  inCart = 0,
}: MenuItemCardProps) {
  const [imgError, setImgError] = useState(false)
  const isOutOfStock = item.availabilityStatus === 'OUT_OF_STOCK'
  const showImage = !!item.imageUrl && !imgError

  return (
    <article className={`qr-menu-item-card${isOutOfStock ? ' qr-menu-item-out-of-stock' : ''}`}>
      <button
        className="qr-menu-item-open"
        type="button"
        onClick={onClick}
        aria-label={`Xem chi tiết: ${item.name}${isOutOfStock ? ' (Hết hàng)' : ''}`}
      >
        <span className="qr-menu-item-img-wrap">
          {showImage ? (
            <img
              className="qr-menu-item-img"
              src={item.imageUrl!}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="qr-menu-item-img-placeholder" aria-hidden="true">
              {item.name.trim().charAt(0).toUpperCase() || '🍽'}
            </span>
          )}
          {isOutOfStock && <span className="qr-menu-item-badge-oos">Hết hàng</span>}
        </span>
        <span className="qr-menu-item-info">
          <span className="qr-menu-item-name">{item.name}</span>
          {item.description && <span className="qr-menu-item-desc">{item.description}</span>}
          <span className="qr-menu-item-price">
            {formatMenuPrice(item.salePrice, currencyCode)}
            {item.baseUnit && <span className="qr-menu-item-unit">/{item.baseUnit}</span>}
          </span>
        </span>
      </button>
      {inCart > 0 && (
        <span className="qr-menu-item-in-cart" aria-label={`Đã chọn ${inCart}`}>
          {inCart}
        </span>
      )}
      {onQuickAdd && !isOutOfStock && (
        <button
          className="qr-menu-item-add"
          type="button"
          aria-label={`Thêm 1 ${item.name} vào giỏ`}
          disabled={quickAddDisabled}
          onClick={onQuickAdd}
        >
          <span aria-hidden="true">+</span>
        </button>
      )}
    </article>
  )
}
