import type { PublicRestaurant, PublicTable } from '../types'

interface QrMenuHeaderProps {
  restaurant: PublicRestaurant
  table: PublicTable
}

export function QrMenuHeader({ restaurant, table }: QrMenuHeaderProps) {
  return (
    <header className="qr-menu-header">
      <h1 className="qr-menu-restaurant-name">{restaurant.name}</h1>
      <div className="qr-menu-table-badge" aria-label={`Bàn: ${table.name} (${table.code})`}>
        <span className="qr-menu-table-icon" aria-hidden="true">🍽</span>
        <span>{table.name}</span>
        <span className="qr-menu-table-code">{table.code}</span>
      </div>
    </header>
  )
}
