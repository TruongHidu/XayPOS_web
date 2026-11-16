import { useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { newIdempotencyKey } from '../../../shared/api/idempotency'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { Notice, PageTitle, Panel, StatusBadge } from '../../../shared/ui/Display'
import { FilterBar, FilterSelect } from '../../../shared/ui/FilterBar'
import { SelectField, TextAreaField } from '../../../shared/ui/FormFields'
import { MutationError } from '../../../shared/ui/MutationError'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { inventoryApi, inventoryKeys } from '../api/inventoryApi'
import { WarehouseFilter } from '../components/InventoryCommon'
import { useWarehouses } from '../hooks/useWarehouses'
import { canManageStockAudits } from '../policies/inventoryAccessPolicy'
import { auditCriteriaSchema, auditDefaults, auditStatuses, type AuditCriteria, type AuditSummary } from '../schemas'
import { auditStatusLabels } from '../utils/inventoryLabels'
import '../inventory.css'

export function AuditsPage() {
  const { access, scope } = useTenantAccess()
  const navigate = useNavigate()
  const { criteria, update, reset, isFiltered } = useUrlCriteria<AuditCriteria>(auditCriteriaSchema, auditDefaults)
  const query = useQuery({
    queryKey: inventoryKeys.auditList(scope, criteria),
    queryFn: ({ signal }) => inventoryApi.audits(scope!, criteria, signal),
    enabled: !!scope,
    placeholderData: keepPreviousData,
  })
  const columns: Column<AuditSummary>[] = [
    { key: 'code', header: 'Phiên kiểm kê', render: (a) => <strong>{a.auditCode}</strong> },
    { key: 'warehouse', header: 'Kho', render: (a) => a.warehouseName },
    {
      key: 'progress',
      header: 'Đã đếm',
      align: 'right',
      render: (a) => (a.status === 'DRAFT' ? <span className="ui-muted-cell">Chưa bắt đầu</span> : `${a.countedItemCount}/${a.itemCount}`),
    },
    { key: 'diff', header: 'Dòng chênh lệch', align: 'right', hideOnNarrow: true, render: (a) => a.changedItemCount },
    { key: 'status', header: 'Trạng thái', render: (a) => <StatusBadge tone={auditStatusLabels[a.status].tone}>{auditStatusLabels[a.status].label}</StatusBadge> },
    { key: 'at', header: 'Tạo lúc', hideOnNarrow: true, render: (a) => formatDateTimeVi(a.createdAt) },
  ]
  return (
    <div className="ui-page">
      <PageTitle
        title="Kiểm kê"
        description="Đếm thực tế và chốt chênh lệch vào tồn kho bằng phiếu điều chỉnh tự động."
        actions={
          canManageStockAudits(access) ? (
            <Link className="button button-primary" to="/app/inventory/audits/new">
              + Tạo kiểm kê
            </Link>
          ) : null
        }
      />
      <FilterBar search={criteria.q} onSearch={(q) => update({ q })} searchPlaceholder="Tìm mã phiên hoặc ghi chú" isFiltered={isFiltered} onReset={reset}>
        <FilterSelect
          label="Trạng thái"
          value={criteria.status}
          options={[{ value: '', label: 'Tất cả' }, ...auditStatuses.map((s) => ({ value: s, label: auditStatusLabels[s].label }))]}
          onChange={(status) => update({ status })}
        />
        <WarehouseFilter value={criteria.warehouseId} onChange={(warehouseId) => update({ warehouseId })} />
      </FilterBar>
      <DataTable
        caption="Phiên kiểm kê"
        columns={columns}
        rows={query.data?.content}
        rowKey={(a) => a.id}
        loading={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        onRowClick={(a) => navigate(`/app/inventory/audits/${encodeURIComponent(a.id)}`)}
        empty={{ title: 'Chưa có phiên kiểm kê', description: 'Tạo phiên kiểm kê để đối chiếu tồn thực tế với hệ thống.' }}
        page={criteria.page}
        totalPages={query.data?.totalPages ?? 0}
        onPageChange={(page) => update({ page })}
      />
    </div>
  )
}

/** Tạo kiểm kê: header only (no snapshot yet), with an idempotency key per content. */
export function AuditCreatePage() {
  const { access } = useTenantAccess()
  const navigate = useNavigate()
  const warehouses = useWarehouses()
  const [warehouseId, setWarehouseId] = useState('')
  const [note, setNote] = useState('')
  const keys = useRef(new Map<string, string>())
  const selected = warehouseId || warehouses.defaultWarehouse?.id || ''
  const create = useTenantMutation({
    mutationFn: (s) => {
      const body = { warehouseId: selected, ...(note.trim() ? { note: note.trim() } : {}) }
      const payload = JSON.stringify(body)
      if (!keys.current.has(payload)) keys.current.set(payload, newIdempotencyKey())
      return inventoryApi.createAudit(s, body, keys.current.get(payload)!)
    },
    invalidate: (s) => [inventoryKeys.audits(s)],
    success: (audit) => `Đã tạo phiên ${audit.auditCode}.`,
    onSuccess: (audit) => navigate(`/app/inventory/audits/${encodeURIComponent(audit.id)}`, { replace: true }),
  })
  if (!canManageStockAudits(access)) return <Notice tone="warning">Bạn chưa có quyền quản lý kiểm kê kho.</Notice>
  const failure = create.error ? tenantError(create.error) : null
  return (
    <div className="ui-page" style={{ maxWidth: 640 }}>
      <Link to="/app/inventory/audits" className="muted" style={{ fontSize: 14 }}>
        ← Kiểm kê
      </Link>
      <PageTitle title="Tạo kiểm kê" />
      <Panel>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (selected) create.mutate(undefined)
          }}
        >
          <SelectField
            label="Kho"
            required
            value={selected}
            placeholder={selected ? undefined : 'Chọn kho đang hoạt động'}
            options={(warehouses.data ?? []).filter((w) => w.active).map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
            onChange={(event) => setWarehouseId(event.target.value)}
          />
          <TextAreaField label="Ghi chú kiểm kê" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Kiểm kê cuối ca" />
          <Notice tone="info">
            Phiên nháp chưa chốt dữ liệu và chưa thay đổi tồn kho. Kho không đổi được sau khi tạo. Nên bắt đầu đếm lúc ít giao dịch (cuối ca).
          </Notice>
          <MutationError error={create.error} />
          {failure && (failure.isNetworkError || (failure.status ?? 0) >= 500) && (
            <Notice tone="info">Chưa rõ phiên đã được tạo hay chưa. Nội dung được giữ nguyên; bấm tạo lại sẽ không tạo trùng phiên.</Notice>
          )}
          <div className="modal-actions">
            <button type="submit" className="button button-primary" disabled={!selected || create.isPending}>
              {create.isPending ? 'Đang tạo…' : 'Tạo phiên nháp'}
            </button>
          </div>
        </form>
      </Panel>
    </div>
  )
}
