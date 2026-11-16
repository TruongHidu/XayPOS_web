import { NavLink } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { AsyncPicker } from '../../../shared/ui/AsyncPicker'
import { StatusBadge } from '../../../shared/ui/Display'
import { FilterSelect } from '../../../shared/ui/FilterBar'
import { inventoryApi, inventoryKeys } from '../api/inventoryApi'
import { useWarehouses } from '../hooks/useWarehouses'
import { canViewInventoryAlerts } from '../policies/inventoryAccessPolicy'
import type { StockItem } from '../schemas'

/** Secondary links between the inventory pages that have no sidebar entry. */
export function InventorySubNav() {
  const { access } = useTenantAccess()
  const links = [
    { to: '/app/inventory/balances', label: 'Tồn kho' },
    { to: '/app/inventory/warehouses', label: 'Quản lý kho' },
    { to: '/app/inventory/transactions', label: 'Biến động kho' },
    ...(canViewInventoryAlerts(access) ? [{ to: '/app/inventory/low-stock', label: 'Tồn thấp' }] : []),
  ]
  return (
    <nav className="inv-subnav" aria-label="Kho">
      {links.map((link) => (
        <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? 'inv-subnav-link inv-subnav-on' : 'inv-subnav-link')}>
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Warehouse select for filters; `allowAll` adds "Tất cả kho". */
export function WarehouseFilter({
  value,
  onChange,
  allowAll = true,
  activeOnly = false,
  label = 'Kho',
}: {
  value: string
  onChange: (id: string) => void
  allowAll?: boolean
  activeOnly?: boolean
  label?: string
}) {
  const warehouses = useWarehouses()
  const rows = (warehouses.data ?? []).filter((w) => !activeOnly || w.active)
  return (
    <FilterSelect
      label={label}
      value={value}
      options={[
        ...(allowAll ? [{ value: '', label: 'Tất cả kho' }] : []),
        ...rows.map((w) => ({ value: w.id, label: `${w.name} (${w.code})${w.isDefault ? ' · mặc định' : ''}${w.active ? '' : ' · ngừng'}` })),
      ]}
      onChange={onChange}
    />
  )
}

/** Search over tracked stock items: ingredients and direct-stock menu items. */
export function StockItemPicker({ onPick, exclude }: { onPick: (item: StockItem) => void; exclude?: Set<string> }) {
  const { scope } = useTenantAccess()
  return (
    <AsyncPicker<StockItem>
      label="Thêm hàng hóa"
      placeholder="Thêm hàng hóa: gõ tên hoặc SKU…"
      queryKey={(q) => inventoryKeys.stockItems(scope, q)}
      search={async (q, signal) => (await inventoryApi.stockItems(scope!, q, signal)).content}
      rowKey={(row) => row.itemId}
      exclude={exclude}
      emptyText="Không có hàng phù hợp. Chỉ nguyên liệu bật “Theo dõi tồn kho” và món trừ kho trực tiếp mới xuất hiện."
      renderRow={(row) => (
        <>
          <span>
            {row.name} {row.itemType === 'MENU_ITEM' && <StatusBadge tone="info">Hàng bán sẵn</StatusBadge>}
            {!row.active && <span className="ui-muted-cell"> · ngừng dùng</span>}
          </span>
          <span className="ui-muted-cell">
            {row.sku ? `${row.sku} · ` : ''}
            {row.baseUnit}
          </span>
        </>
      )}
      onPick={onPick}
    />
  )
}
