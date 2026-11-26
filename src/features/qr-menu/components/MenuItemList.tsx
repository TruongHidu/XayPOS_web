import type { PublicMenuItem } from '../types'
import { MenuItemCard } from './MenuItemCard'

interface MenuItemListProps {
  items: PublicMenuItem[]
  currencyCode: string
  onItemClick: (item: PublicMenuItem) => void
  /** Quick "+" on each card; omitted when guests can only look at the menu. */
  onQuickAdd?: (item: PublicMenuItem) => void
  quickAddDisabled?: boolean
  /** Portions in the cart per menu item id. */
  inCart?: Record<string, number>
}

export function MenuItemList({
  items,
  currencyCode,
  onItemClick,
  onQuickAdd,
  quickAddDisabled,
  inCart,
}: MenuItemListProps) {
  return (
    <div className="qr-menu-item-grid" role="list">
      {items.map((item) => (
        <div key={item.id} role="listitem">
          <MenuItemCard
            item={item}
            currencyCode={currencyCode}
            onClick={() => onItemClick(item)}
            onQuickAdd={onQuickAdd ? () => onQuickAdd(item) : undefined}
            quickAddDisabled={quickAddDisabled}
            inCart={inCart?.[item.id]}
          />
        </div>
      ))}
    </div>
  )
}
