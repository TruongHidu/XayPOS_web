import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { Modal } from '../../../shared/components/AdminUi'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { Notice, PageTitle, StatusBadge } from '../../../shared/ui/Display'
import { FilterBar, FilterSelect } from '../../../shared/ui/FilterBar'
import { QuantityField } from '../../../shared/ui/FormFields'
import { MutationError } from '../../../shared/ui/MutationError'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { inventoryApi, inventoryKeys } from '../api/inventoryApi'
import { InventorySubNav, WarehouseFilter } from '../components/InventoryCommon'
import { useWarehouses } from '../hooks/useWarehouses'
import { canInventory, canViewInventoryAlerts, canWriteDocument } from '../policies/inventoryAccessPolicy'
import { balanceCriteriaSchema, balanceDefaults, stockItemId, type Balance, type BalanceCriteria } from '../schemas'
import { qty } from '../utils/inventoryLabels'
import '../inventory.css'

/** Tồn kho: stock per warehouse with physical / reserved / available and thresholds. */
export function BalancesPage() {
  const { access, scope } = useTenantAccess()
  const navigate = useNavigate()
  const warehouses = useWarehouses()
  const { criteria, update, reset, isFiltered } = useUrlCriteria<BalanceCriteria>(balanceCriteriaSchema, balanceDefaults)
  const [threshold, setThreshold] = useState<Balance | null>(null)
  const warehouseId = criteria.warehouseId || warehouses.defaultWarehouse?.id || warehouses.data?.[0]?.id || ''

  // Without an explicit choice, open the default warehouse.
  useEffect(() => {
    if (!criteria.warehouseId && warehouseId) update({ warehouseId })
  }, [criteria.warehouseId, warehouseId, update])

  const effective = { ...criteria, warehouseId }
  const query = useQuery({
    queryKey: inventoryKeys.balances(scope, effective),
    queryFn: ({ signal }) => inventoryApi.balances(scope!, effective, signal),
    enabled: !!scope && !!warehouseId,
    placeholderData: keepPreviousData,
  })
  const canReceive = canWriteDocument(access, 'RECEIPT')

  const columns: Column<Balance>[] = [
    {
      key: 'name',
      header: 'Hàng hóa',
      sortKey: 'ingredientName',
      render: (b) => (
        <div className="ui-cell-title">
          <strong>
            {b.ingredientName} {b.itemType === 'MENU_ITEM' && <StatusBadge tone="info">Hàng bán sẵn</StatusBadge>}
          </strong>
          <span>
            {b.ingredientSku ?? 'Không SKU'}
            {!b.ingredientActive && ' · ngừng dùng'}
          </span>
        </div>
      ),
    },
    { key: 'quantity', header: 'Tồn vật lý', sortKey: 'quantity', align: 'right', render: (b) => <strong>{qty(b.quantity, b.baseUnit)}</strong> },
    { key: 'reserved', header: 'Đang giữ cho đơn', align: 'right', hideOnNarrow: true, render: (b) => qty(b.reservedQuantity, b.baseUnit) },
    { key: 'available', header: 'Khả dụng', align: 'right', render: (b) => qty(b.availableQuantity, b.baseUnit) },
    {
      key: 'min',
      header: 'Ngưỡng cảnh báo',
      sortKey: 'minQuantity',
      align: 'right',
      hideOnNarrow: true,
      render: (b) => (b.minQuantity > 0 ? qty(b.minQuantity, b.baseUnit) : <span className="ui-muted-cell">Chưa đặt</span>),
    },
    {
      key: 'state',
      header: 'Tình trạng',
      render: (b) => (b.lowStock ? <StatusBadge tone="danger">Tồn thấp</StatusBadge> : <StatusBadge tone="success">Bình thường</StatusBadge>),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (b) => (
        <div className="ui-inline-actions" onClick={(event) => event.stopPropagation()}>
          {canReceive && (
            <Link
              className="button button-small button-secondary"
              to={`/app/inventory/stock-documents/new?type=RECEIPT&warehouseId=${encodeURIComponent(b.warehouseId)}&itemId=${encodeURIComponent(stockItemId(b))}&name=${encodeURIComponent(b.ingredientName)}&unit=${encodeURIComponent(b.baseUnit)}`}
            >
              Nhập thêm
            </Link>
          )}
          {canInventory(access, 'INVENTORY_THRESHOLD_UPDATE') && (
            <button type="button" className="button button-small button-ghost" onClick={() => setThreshold(b)}>
              Ngưỡng
            </button>
          )}
          <Link
            className="button button-small button-ghost"
            to={`/app/inventory/transactions?warehouseId=${encodeURIComponent(b.warehouseId)}&ingredientId=${encodeURIComponent(stockItemId(b))}`}
          >
            Lịch sử
          </Link>
        </div>
      ),
    },
  ]

  return (
    <div className="ui-page">
      <InventorySubNav />
      <PageTitle
        title="Tồn kho"
        description="Tồn vật lý gồm cả phần đang giữ cho đơn chưa phục vụ; khả dụng = tồn − đang giữ."
        actions={
          canReceive ? (
            <button
              type="button"
              className="button button-primary"
              onClick={() => navigate(`/app/inventory/stock-documents/new?type=RECEIPT${warehouseId ? `&warehouseId=${encodeURIComponent(warehouseId)}` : ''}`)}
            >
              Nhập kho
            </button>
          ) : null
        }
      />
      {warehouses.data && warehouses.data.length === 0 ? (
        <Notice tone="info" title="Chưa có kho nào">
          Tạo kho đầu tiên tại <Link to="/app/inventory/warehouses">Quản lý kho</Link>, rồi bật “Theo dõi tồn kho” cho nguyên liệu trong Thực đơn.
        </Notice>
      ) : (
        <>
          <FilterBar search={criteria.q} onSearch={(q) => update({ q })} searchPlaceholder="Tìm hàng hóa theo tên hoặc SKU" isFiltered={isFiltered && !!criteria.q} onReset={reset}>
            <WarehouseFilter value={warehouseId} onChange={(id) => update({ warehouseId: id })} allowAll={false} />
            <FilterSelect
              label="Hàng hóa"
              value={criteria.active}
              options={[
                { value: '', label: 'Tất cả' },
                { value: 'true', label: 'Đang dùng' },
                { value: 'false', label: 'Ngừng dùng' },
              ]}
              onChange={(active) => update({ active })}
            />
            {canViewInventoryAlerts(access) && (
              <FilterSelect
                label="Tình trạng"
                value={criteria.low}
                options={[
                  { value: '', label: 'Tất cả' },
                  { value: 'true', label: 'Chỉ tồn thấp' },
                ]}
                onChange={(low) => update({ low })}
              />
            )}
          </FilterBar>
          <DataTable
            caption="Tồn kho"
            columns={columns}
            rows={query.data?.content}
            rowKey={(b) => `${b.warehouseId}-${stockItemId(b)}`}
            loading={query.isFetching}
            error={query.error}
            onRetry={() => void query.refetch()}
            rowClassName={(b) => (b.lowStock ? 'inv-row-low' : undefined)}
            empty={{
              title: criteria.low === 'true' ? 'Không có hàng tồn thấp' : 'Chưa có hàng theo dõi tồn',
              description: 'Bật “Theo dõi tồn kho” cho nguyên liệu (Thực đơn → Nguyên liệu) hoặc chọn “Trừ kho trực tiếp” cho món bán sẵn.',
            }}
            sort={{ by: criteria.sortBy, direction: criteria.direction }}
            onSort={(sort) => update({ sortBy: sort.by as BalanceCriteria['sortBy'], direction: sort.direction })}
            page={criteria.page}
            totalPages={query.data?.totalPages ?? 0}
            onPageChange={(page) => update({ page })}
          />
        </>
      )}
      {threshold && <ThresholdDialog balance={threshold} onClose={() => setThreshold(null)} />}
    </div>
  )
}

function ThresholdDialog({ balance, onClose }: { balance: Balance; onClose: () => void }) {
  const [value, setValue] = useState<number | null>(balance.minQuantity)
  const save = useTenantMutation({
    mutationFn: (s, minQuantity: number) =>
      // A logical (row-less) balance has no version yet: the first threshold sends null.
      inventoryApi.setThreshold(s, balance.warehouseId, stockItemId(balance), balance.balanceId ? balance.version : null, minQuantity),
    invalidate: (s) => [inventoryKeys.root(s)],
    success: (_, minQuantity) => (minQuantity > 0 ? `Sẽ cảnh báo khi ${balance.ingredientName} còn ≤ ${qty(minQuantity, balance.baseUnit)}.` : 'Đã tắt cảnh báo tồn thấp.'),
    onSuccess: onClose,
  })
  return (
    <Modal title={`Ngưỡng cảnh báo: ${balance.ingredientName}`} onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (value !== null && value >= 0) save.mutate(value)
        }}
      >
        <QuantityField
          label="Cảnh báo khi tồn vật lý còn bằng hoặc dưới"
          unit={balance.baseUnit}
          value={value}
          onChange={setValue}
          hint={`Hiện tồn ${qty(balance.quantity, balance.baseUnit)}. Nhập 0 để tắt cảnh báo.`}
          error={value === null || value < 0 ? 'Nhập số không âm.' : undefined}
          data-autofocus
        />
        <MutationError error={save.error} />
        <div className="modal-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className="button button-primary" disabled={save.isPending || value === null || value < 0}>
            {save.isPending ? 'Đang lưu…' : 'Lưu ngưỡng'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
