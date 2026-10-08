import { useState } from 'react'
import type { PublicMenuItem } from '../types'
import { formatMenuPrice } from '../utils/formatMenuPrice'

interface MenuItemCardProps {
  item: PublicMenuItem
  currencyCode: string
  onClick: () => void
}

const PLACEHOLDER_IMAGE = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="%23f0f4f8" width="200" height="200"/><text fill="%239fb3c8" font-family="sans-serif" font-size="40" text-anchor="middle" x="100" y="110">🍽</text></svg>'
)

export function MenuItemCard({ item, currencyCode, onClick }: MenuItemCardProps) {
  const [imgError, setImgError] = useState(false)
  const isOutOfStock = item.availabilityStatus === 'OUT_OF_STOCK'
  const imgSrc = item.imageUrl && !imgError ? item.imageUrl : PLACEHOLDER_IMAGE

  return (
    <button
      className={`qr-menu-item-card${isOutOfStock ? ' qr-menu-item-out-of-stock' : ''}`}
      type="button"
      onClick={onClick}
      aria-label={`Xem chi tiết: ${item.name}${isOutOfStock ? ' (Hết hàng)' : ''}`}
    >
      <div className="qr-menu-item-img-wrap">
        <img
          className="qr-menu-item-img"
          src={imgSrc}
          alt={item.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
        {isOutOfStock && (
          <span className="qr-menu-item-badge-oos">Hết hàng</span>
        )}
      </div>
      <div className="qr-menu-item-info">
        <span className="qr-menu-item-name">{item.name}</span>
        {item.description && (
          <span className="qr-menu-item-desc">{item.description}</span>
        )}
        <span className="qr-menu-item-price">
          {formatMenuPrice(item.salePrice, currencyCode)}
          {item.baseUnit && <span className="qr-menu-item-unit">/{item.baseUnit}</span>}
        </span>
      </div>
    </button>
  )
}
