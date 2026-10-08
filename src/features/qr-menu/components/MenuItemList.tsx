import type { PublicMenuItem } from '../types'
import { MenuItemCard } from './MenuItemCard'

interface MenuItemListProps {
  items: PublicMenuItem[]
  currencyCode: string
  onItemClick: (item: PublicMenuItem) => void
}

export function MenuItemList({ items, currencyCode, onItemClick }: MenuItemListProps) {
  return (
    <div className="qr-menu-item-grid" role="list">
      {items.map(item => (
        <div key={item.id} role="listitem">
          <MenuItemCard
            item={item}
            currencyCode={currencyCode}
            onClick={() => onItemClick(item)}
          />
        </div>
      ))}
    </div>
  )
}
