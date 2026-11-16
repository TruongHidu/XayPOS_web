import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { PageTitle, StatusBadge } from '../../../shared/ui/Display'
import { FilterBar } from '../../../shared/ui/FilterBar'
import { inventoryApi, inventoryKeys } from '../api/inventoryApi'
import { InventorySubNav, WarehouseFilter } from '../components/InventoryCommon'
import { canWriteDocument } from '../policies/inventoryAccessPolicy'
import { stockItemId, type Balance } from '../schemas'
import { qty } from '../utils/inventoryLabels'
import '../inventory.css'

/** Tồn thấp: balances low right now (not the alert history). */
export function LowStockPage() {
  const { access, scope } = useTenantAccess()
  const [params, setParams] = useSearchParams()
  const warehouseId = params.get('warehouseId') ?? ''
  const page = Number(params.get('page') ?? 0) || 0
  const query = useQuery({
    queryKey: inventoryKeys.lowStock(scope, { warehouseId, page }),
    queryFn: ({ signal }) => inventoryApi.lowStock(scope!, { warehouseId: warehouseId || undefined, page }, signal),
    enabled: !!scope,
    placeholderData: keepPreviousData,
  })
  const columns: Column<Balance>[] = [
    {
      key: 'name',
      header: 'Hàng hóa',
      render: (b) => (
        <div className="ui-cell-title">
          <strong>
            {b.ingredientName} {b.itemType === 'MENU_ITEM' && <StatusBadge tone="info">Hàng bán sẵn</StatusBadge>}
          </strong>
          <span>{b.warehouseCode}</span>
        </div>
      ),
    },
    { key: 'qty', header: 'Tồn vật lý', align: 'right', render: (b) => <strong className="inv-minus">{qty(b.quantity, b.baseUnit)}</strong> },
    { key: 'min', header: 'Ngưỡng', align: 'right', render: (b) => qty(b.minQuantity, b.baseUnit) },
    { key: 'available', header: 'Khả dụng', align: 'right', hideOnNarrow: true, render: (b) => qty(b.availableQuantity, b.baseUnit) },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (b) =>
        canWriteDocument(access, 'RECEIPT') ? (
          <Link
            className="button button-small button-primary"
            to={`/app/inventory/stock-documents/new?type=RECEIPT&warehouseId=${encodeURIComponent(b.warehouseId)}&itemId=${encodeURIComponent(stockItemId(b))}&name=${encodeURIComponent(b.ingredientName)}&unit=${encodeURIComponent(b.baseUnit)}`}
          >
            Nhập kho
          </Link>
        ) : null,
    },
  ]
  return (
    <div className="ui-page">
      <InventorySubNav />
      <PageTitle title="Hàng đang tồn thấp" description="Hàng có tồn vật lý bằng hoặc dưới ngưỡng cảnh báo ngay lúc này." />
      <FilterBar isFiltered={!!warehouseId} onReset={() => setParams({}, { replace: true })}>
        <WarehouseFilter value={warehouseId} onChange={(id) => setParams(id ? { warehouseId: id } : {}, { replace: true })} />
      </FilterBar>
      <DataTable
        caption="Hàng tồn thấp"
        columns={columns}
        rows={query.data?.content}
        rowKey={(b) => `${b.warehouseId}-${stockItemId(b)}`}
        loading={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{ title: 'Không có hàng tồn thấp', description: 'Mọi hàng có ngưỡng đều đang trên mức cảnh báo.' }}
        page={page}
        totalPages={query.data?.totalPages ?? 0}
        onPageChange={(next) => setParams((current) => ({ ...Object.fromEntries(current), page: String(next) }), { replace: true })}
      />
    </div>
  )
}
