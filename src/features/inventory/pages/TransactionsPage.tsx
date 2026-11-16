import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { PageTitle } from '../../../shared/ui/Display'
import { FilterBar, FilterSelect } from '../../../shared/ui/FilterBar'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { formatDateTimeVi, formatVnd } from '../../../shared/utils/adminFormatting'
import { inventoryApi, inventoryKeys } from '../api/inventoryApi'
import { InventorySubNav, WarehouseFilter } from '../components/InventoryCommon'
import { transactionCriteriaSchema, transactionDefaults, transactionTypes, type InventoryTransaction, type TransactionCriteria } from '../schemas'
import { qty, signedQty, transactionTypeLabels } from '../utils/inventoryLabels'
import '../inventory.css'

/** Biến động kho: the append-only ledger, filterable from other pages via the URL. */
export function TransactionsPage() {
  const { scope } = useTenantAccess()
  const { criteria, update, reset, isFiltered } = useUrlCriteria<TransactionCriteria>(transactionCriteriaSchema, transactionDefaults)
  const query = useQuery({
    queryKey: inventoryKeys.transactions(scope, criteria),
    queryFn: ({ signal }) => inventoryApi.transactions(scope!, criteria, signal),
    enabled: !!scope,
    placeholderData: keepPreviousData,
  })
  const columns: Column<InventoryTransaction>[] = [
    { key: 'at', header: 'Thời điểm', render: (t) => formatDateTimeVi(t.createdAt) },
    {
      key: 'item',
      header: 'Hàng hóa',
      render: (t) => (
        <div className="ui-cell-title">
          <strong>{t.ingredientName}</strong>
          <span>{t.warehouseCode}</span>
        </div>
      ),
    },
    { key: 'type', header: 'Loại', render: (t) => transactionTypeLabels[t.transactionType] ?? t.transactionType },
    {
      key: 'change',
      header: 'Thay đổi',
      align: 'right',
      render: (t) => <span className={t.quantityChange >= 0 ? 'inv-plus' : 'inv-minus'}>{signedQty(t.quantityChange, t.unit)}</span>,
    },
    { key: 'after', header: 'Tồn trước → sau', align: 'right', hideOnNarrow: true, render: (t) => `${qty(t.beforeQuantity)} → ${qty(t.afterQuantity, t.unit)}` },
    {
      key: 'cost',
      header: 'Đơn giá',
      align: 'right',
      hideOnNarrow: true,
      // Unknown reference cost stays unknown, never 0.
      render: (t) => (t.unitCost === null ? <span className="ui-muted-cell">Chưa có giá</span> : formatVnd(t.unitCost)),
    },
    {
      key: 'source',
      header: 'Nguồn',
      render: (t) =>
        t.stockDocumentId ? (
          <Link to={`/app/inventory/stock-documents/${encodeURIComponent(t.stockDocumentId)}`}>{t.documentCode}</Link>
        ) : t.orderId ? (
          <Link to={`/app/orders/${encodeURIComponent(t.orderId)}`}>Đơn hàng</Link>
        ) : (
          '—'
        ),
    },
  ]
  return (
    <div className="ui-page">
      <InventorySubNav />
      <PageTitle title="Biến động kho" description="Mọi lần nhập, xuất, điều chỉnh và bán hàng trừ kho. Sổ chỉ ghi thêm, không sửa." />
      <FilterBar isFiltered={isFiltered} onReset={reset}>
        <WarehouseFilter value={criteria.warehouseId} onChange={(warehouseId) => update({ warehouseId })} />
        <FilterSelect
          label="Loại"
          value={criteria.transactionType}
          options={[{ value: '', label: 'Tất cả' }, ...transactionTypes.map((t) => ({ value: t, label: transactionTypeLabels[t] }))]}
          onChange={(transactionType) => update({ transactionType })}
        />
        <label className="ui-filter-select">
          <span>Từ ngày</span>
          <input type="date" value={criteria.from} max={criteria.to || undefined} onChange={(e) => update({ from: e.target.value })} />
        </label>
        <label className="ui-filter-select">
          <span>Đến ngày</span>
          <input type="date" value={criteria.to} min={criteria.from || undefined} onChange={(e) => update({ to: e.target.value })} />
        </label>
        {(criteria.ingredientId || criteria.documentId || criteria.orderId) && (
          <span className="ui-badge ui-badge-info">Đang lọc theo {criteria.documentId ? 'chứng từ' : criteria.orderId ? 'đơn' : 'hàng hóa'}</span>
        )}
      </FilterBar>
      <DataTable
        caption="Biến động kho"
        columns={columns}
        rows={query.data?.content}
        rowKey={(t) => t.transactionId}
        loading={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{ title: 'Chưa có biến động', description: 'Xác nhận phiếu nhập/xuất hoặc bán món trừ kho để thấy biến động.' }}
        page={criteria.page}
        totalPages={query.data?.totalPages ?? 0}
        onPageChange={(page) => update({ page })}
      />
    </div>
  )
}
