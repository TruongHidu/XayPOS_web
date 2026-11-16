import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { PageTitle, StatusBadge } from '../../../shared/ui/Display'
import { FilterBar, FilterSelect } from '../../../shared/ui/FilterBar'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { formatDateTimeVi, formatVnd } from '../../../shared/utils/adminFormatting'
import { inventoryApi, inventoryKeys } from '../api/inventoryApi'
import { WarehouseFilter } from '../components/InventoryCommon'
import { writableDocumentTypes } from '../policies/inventoryAccessPolicy'
import { documentCriteriaSchema, documentDefaults, documentStatuses, documentTypes, type DocumentCriteria, type DocumentSummary } from '../schemas'
import { documentStatusLabels, documentTypeLabels, qty } from '../utils/inventoryLabels'
import '../inventory.css'

/** Chứng từ kho: receipts, issues and adjustments (drafts only change stock once confirmed). */
export function DocumentsPage() {
  const { access, scope } = useTenantAccess()
  const navigate = useNavigate()
  const { criteria, update, reset, isFiltered } = useUrlCriteria<DocumentCriteria>(documentCriteriaSchema, documentDefaults)
  const query = useQuery({
    queryKey: inventoryKeys.documentList(scope, criteria),
    queryFn: ({ signal }) => inventoryApi.documents(scope!, criteria, signal),
    enabled: !!scope,
    placeholderData: keepPreviousData,
  })
  const writable = writableDocumentTypes(access)
  const columns: Column<DocumentSummary>[] = [
    {
      key: 'code',
      header: 'Chứng từ',
      render: (d) => (
        <div className="ui-cell-title">
          <strong>{d.documentCode}</strong>
          <span>
            {documentTypeLabels[d.documentType]}
            {d.stockAuditId ? ' · từ kiểm kê' : ''}
          </span>
        </div>
      ),
    },
    { key: 'warehouse', header: 'Kho', hideOnNarrow: true, render: (d) => d.warehouseName },
    { key: 'lines', header: 'Số dòng', align: 'right', hideOnNarrow: true, render: (d) => d.lineCount },
    { key: 'qty', header: 'Tổng số lượng', align: 'right', hideOnNarrow: true, render: (d) => qty(d.totalQuantity) },
    { key: 'cost', header: 'Giá trị', align: 'right', render: (d) => formatVnd(d.totalCost) },
    { key: 'status', header: 'Trạng thái', render: (d) => <StatusBadge tone={documentStatusLabels[d.status].tone}>{documentStatusLabels[d.status].label}</StatusBadge> },
    { key: 'at', header: 'Tạo lúc', hideOnNarrow: true, render: (d) => formatDateTimeVi(d.createdAt) },
  ]
  return (
    <div className="ui-page">
      <PageTitle
        title="Chứng từ kho"
        description="Phiếu nhập, xuất và điều chỉnh. Phiếu nháp chưa làm thay đổi tồn kho cho tới khi xác nhận."
        actions={
          <div className="ui-inline-actions">
            {writable.map((type) => (
              <button
                key={type}
                type="button"
                className={type === 'RECEIPT' ? 'button button-primary' : 'button button-ghost'}
                onClick={() => navigate(`/app/inventory/stock-documents/new?type=${type}`)}
              >
                + {documentTypeLabels[type]}
              </button>
            ))}
          </div>
        }
      />
      <FilterBar search={criteria.q} onSearch={(q) => update({ q })} searchPlaceholder="Tìm mã phiếu hoặc ghi chú" isFiltered={isFiltered} onReset={reset}>
        <FilterSelect
          label="Loại"
          value={criteria.type}
          options={[{ value: '', label: 'Tất cả' }, ...documentTypes.map((t) => ({ value: t, label: documentTypeLabels[t] }))]}
          onChange={(type) => update({ type })}
        />
        <FilterSelect
          label="Trạng thái"
          value={criteria.status}
          options={[{ value: '', label: 'Tất cả' }, ...documentStatuses.map((s) => ({ value: s, label: documentStatusLabels[s].label }))]}
          onChange={(status) => update({ status })}
        />
        <WarehouseFilter value={criteria.warehouseId} onChange={(warehouseId) => update({ warehouseId })} />
        <label className="ui-filter-select">
          <span>Từ ngày</span>
          <input type="date" value={criteria.from} max={criteria.to || undefined} onChange={(e) => update({ from: e.target.value })} />
        </label>
        <label className="ui-filter-select">
          <span>Đến ngày</span>
          <input type="date" value={criteria.to} min={criteria.from || undefined} onChange={(e) => update({ to: e.target.value })} />
        </label>
      </FilterBar>
      <DataTable
        caption="Chứng từ kho"
        columns={columns}
        rows={query.data?.content}
        rowKey={(d) => d.id}
        loading={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        onRowClick={(d) => navigate(`/app/inventory/stock-documents/${encodeURIComponent(d.id)}`)}
        empty={{ title: 'Chưa có chứng từ', description: 'Tạo phiếu nhập để đưa hàng vào kho.' }}
        page={criteria.page}
        totalPages={query.data?.totalPages ?? 0}
        onPageChange={(page) => update({ page })}
      />
    </div>
  )
}
