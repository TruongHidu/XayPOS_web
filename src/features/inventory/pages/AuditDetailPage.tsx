import { useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { KpiGrid, Notice, PageTitle, StatCard, StatusBadge } from '../../../shared/ui/Display'
import { FilterBar, FilterSelect } from '../../../shared/ui/FilterBar'
import { NumberInput } from '../../../shared/ui/FormFields'
import { MutationError } from '../../../shared/ui/MutationError'
import { useUnsavedChangesGuard } from '../../../shared/ui/useUnsavedChangesGuard'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { inventoryApi, inventoryKeys } from '../api/inventoryApi'
import { canConfirmStockAudits, canManageStockAudits } from '../policies/inventoryAccessPolicy'
import { auditItemCriteriaSchema, auditItemDefaults, type AuditDetail, type AuditItem, type AuditItemCriteria } from '../schemas'
import { auditStatusLabels, qty, signedQty } from '../utils/inventoryLabels'
import '../inventory.css'

const BATCH = 100
type Draft = Map<string, number>
type Dialog = 'start' | 'confirm' | 'cancel' | null

/**
 * Phiếu kiểm kê. Counts are drafted locally (across pages) and saved in
 * batches of ≤100 lines, one after another, each with the newest header
 * version. An empty cell is "not counted", never 0.
 */
export function AuditDetailPage() {
  const { auditId = '' } = useParams()
  const { access, scope } = useTenantAccess()
  const client = useQueryClient()
  const [draft, setDraft] = useState<Draft>(() => new Map())
  const [dialog, setDialog] = useState<Dialog>(null)
  const { criteria, update } = useUrlCriteria<AuditItemCriteria>(auditItemCriteriaSchema, auditItemDefaults)
  const audit = useQuery({
    queryKey: inventoryKeys.audit(scope, auditId),
    queryFn: ({ signal }) => inventoryApi.audit(scope!, auditId, signal),
    enabled: !!scope,
  })
  const counting = audit.data?.status === 'COUNTING'
  const items = useQuery({
    queryKey: inventoryKeys.auditItems(scope, auditId, criteria),
    queryFn: ({ signal }) => inventoryApi.auditItems(scope!, auditId, criteria, signal),
    enabled: !!scope && !!audit.data && audit.data.status !== 'DRAFT',
    placeholderData: keepPreviousData,
  })
  const dirty = draft.size
  useUnsavedChangesGuard(dirty > 0, `Còn ${dirty} dòng đếm chưa lưu. Rời trang và bỏ số đã nhập?`)

  const put = (next: AuditDetail) => client.setQueryData(inventoryKeys.audit(scope, auditId), next)
  const refresh = () => {
    void client.invalidateQueries({ queryKey: inventoryKeys.audits(scope) })
  }

  const save = useTenantMutation({
    mutationFn: async (s) => {
      let current = audit.data!
      const lines = [...draft.entries()]
      for (let index = 0; index < lines.length; index += BATCH) {
        const batch = lines.slice(index, index + BATCH).map(([auditItemId, countedQuantity]) => ({ auditItemId, countedQuantity }))
        // Sequential on purpose: every batch needs the version the previous one returned.
        current = await inventoryApi.countAudit(s, auditId, current.version, batch)
        put(current)
        setDraft((value) => {
          const next = new Map(value)
          batch.forEach((line) => next.delete(line.auditItemId))
          return next
        })
      }
      return current
    },
    invalidate: (s) => [inventoryKeys.audits(s)],
    success: 'Đã lưu số đếm.',
  })
  const transition = useTenantMutation({
    mutationFn: (s, input: { kind: Exclude<Dialog, null>; note: string }) => {
      const version = audit.data!.version
      if (input.kind === 'start') return inventoryApi.startAudit(s, auditId, version)
      if (input.kind === 'confirm') return inventoryApi.confirmAudit(s, auditId, version)
      return inventoryApi.cancelAudit(s, auditId, version, input.note)
    },
    invalidate: (s, next) => (next.status === 'CONFIRMED' ? [inventoryKeys.root(s)] : [inventoryKeys.audits(s)]),
    success: (next) =>
      next.status === 'COUNTING' ? 'Đã chốt danh sách hàng, bắt đầu đếm.' : next.status === 'CONFIRMED' ? 'Đã chốt kiểm kê; tồn kho đã cập nhật.' : 'Đã hủy phiên kiểm kê.',
    onSuccess: (next) => {
      put(next)
      setDialog(null)
      if (next.status !== 'COUNTING') setDraft(new Map())
    },
  })

  if (audit.isLoading) return <LoadingSkeleton rows={6} />
  const a = audit.data
  if (!a) return <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
  const canManage = canManageStockAudits(access)
  const editable = counting && canManage
  const status = auditStatusLabels[a.status]
  const staleError = transition.error && tenantError(transition.error).code === 'STOCK_AUDIT_SNAPSHOT_STALE'
  const counted = (row: AuditItem) => (draft.get(row.id) ?? row.countedQuantity)
  const setCount = (row: AuditItem, value: number | null) =>
    setDraft((current) => {
      const next = new Map(current)
      // An empty cell drops the draft (the server cannot "uncount" a saved line).
      if (value === null || value === row.countedQuantity) next.delete(row.id)
      else next.set(row.id, value)
      return next
    })

  const columns: Column<AuditItem>[] = [
    {
      key: 'name',
      header: 'Hàng hóa',
      render: (row) => (
        <div className="ui-cell-title">
          <strong>{row.name}</strong>
          <span>{row.sku ?? 'Không SKU'}</span>
        </div>
      ),
    },
    { key: 'system', header: 'Tồn hệ thống', align: 'right', render: (row) => qty(row.systemQuantity, row.unit) },
    {
      key: 'counted',
      header: 'Số đếm thực tế',
      align: 'right',
      render: (row) =>
        editable ? (
          <span className="ui-inline-actions" style={{ justifyContent: 'flex-end' }}>
            <span className="inv-count-input">
              <NumberInput
                aria-label={`Số đếm ${row.name}`}
                decimals={3}
                suffix={row.unit}
                value={counted(row)}
                placeholder="Chưa đếm"
                onChange={(value) => setCount(row, value)}
              />
            </span>
            {counted(row) === null && (
              <button type="button" className="button button-small button-ghost" title="Điền bằng tồn hệ thống" onClick={() => setCount(row, row.systemQuantity)}>
                Khớp
              </button>
            )}
          </span>
        ) : row.countedQuantity === null ? (
          <span className="ui-muted-cell">Chưa đếm</span>
        ) : (
          qty(row.countedQuantity, row.unit)
        ),
    },
    {
      key: 'diff',
      header: 'Chênh lệch',
      align: 'right',
      render: (row) => {
        const value = counted(row)
        if (value === null) return <span className="ui-muted-cell">—</span>
        const diff = Math.round((value - row.systemQuantity) * 1000) / 1000
        return diff === 0 ? <span className="ui-muted-cell">Khớp</span> : <span className={diff > 0 ? 'inv-plus' : 'inv-minus'}>{signedQty(diff, row.unit)}</span>
      },
    },
  ]

  return (
    <div className="ui-page">
      <Link to="/app/inventory/audits" className="muted" style={{ fontSize: 14 }}>
        ← Kiểm kê
      </Link>
      <PageTitle
        title={`Kiểm kê ${a.auditCode}`}
        description={`${a.warehouseName} (${a.warehouseCode}) · tạo lúc ${formatDateTimeVi(a.createdAt)}${a.note ? ` · ${a.note}` : ''}`}
        actions={
          <div className="ui-inline-actions">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            {a.status === 'DRAFT' && canManage && (
              <button type="button" className="button button-primary" onClick={() => setDialog('start')}>
                Bắt đầu đếm
              </button>
            )}
            {(a.status === 'DRAFT' || a.status === 'COUNTING') && canManage && (
              <button type="button" className="button button-ghost" onClick={() => setDialog('cancel')}>
                Hủy phiên
              </button>
            )}
          </div>
        }
      />
      {a.status !== 'DRAFT' && (
        <KpiGrid columns={3}>
          <StatCard label="Đã đếm" icon="checklist" value={`${a.countedItemCount}/${a.itemCount}`} />
          <StatCard label="Dòng chênh lệch" icon="warning" tone={a.changedItemCount ? 'warning' : 'success'} value={a.changedItemCount} />
          <StatCard
            label="Phiếu điều chỉnh"
            icon="receipt"
            tone="info"
            value={
              a.adjustmentDocumentId ? (
                <Link to={`/app/inventory/stock-documents/${encodeURIComponent(a.adjustmentDocumentId)}`}>{a.adjustmentDocumentCode}</Link>
              ) : a.status === 'CONFIRMED' ? (
                'Không có chênh lệch'
              ) : (
                '—'
              )
            }
          />
        </KpiGrid>
      )}
      {a.status === 'DRAFT' && (
        <Notice tone="info">Phiên nháp chưa có danh sách hàng. Bấm “Bắt đầu đếm” để chốt danh sách và số tồn hệ thống của kho.</Notice>
      )}
      {counting && (
        <Notice tone="warning">
          Kho vẫn nhận giao dịch trong lúc đếm. Nhập/xuất/chế biến hàng trong danh sách sẽ khiến phải hủy phiên và đếm lại. Số đếm là tồn vật lý, đã gồm hàng đang giữ cho đơn.
        </Notice>
      )}
      {staleError && (
        <Notice tone="danger" title="Số liệu không còn khớp">
          Kho đã có biến động sau khi bắt đầu đếm. Số đã nhập được giữ để tham khảo; hãy hủy phiên này, tạo phiên mới và đếm lại.
        </Notice>
      )}
      {a.status !== 'DRAFT' && (
        <>
          <FilterBar search={criteria.iq} onSearch={(iq) => update({ iq })} searchPlaceholder="Tìm tên hoặc SKU">
            <FilterSelect
              label="Hiển thị"
              value={criteria.diff === 'true' ? 'diff' : criteria.counted === 'false' ? 'todo' : criteria.counted === 'true' ? 'done' : ''}
              options={[
                { value: '', label: 'Tất cả dòng' },
                { value: 'todo', label: 'Chưa đếm' },
                { value: 'done', label: 'Đã đếm' },
                { value: 'diff', label: 'Chỉ dòng chênh lệch' },
              ]}
              onChange={(value) =>
                update({ counted: value === 'todo' ? 'false' : value === 'done' ? 'true' : '', diff: value === 'diff' ? 'true' : '' })
              }
            />
          </FilterBar>
          <DataTable
            caption="Phiếu đếm"
            columns={columns}
            rows={items.data?.content}
            rowKey={(row) => row.id}
            loading={items.isFetching}
            error={items.error}
            onRetry={() => void items.refetch()}
            rowClassName={(row) => (draft.has(row.id) ? 'inv-dirty' : undefined)}
            empty={{ title: 'Không có dòng phù hợp', description: 'Thử đổi bộ lọc.' }}
            page={criteria.ipage}
            totalPages={items.data?.totalPages ?? 0}
            onPageChange={(ipage) => update({ ipage })}
          />
        </>
      )}
      <MutationError
        error={save.error}
        onReload={() => {
          void audit.refetch()
          void items.refetch()
        }}
      />
      {counting && (
        <div className="inv-sticky-bar">
          <span className="inv-sticky-info">{dirty > 0 ? `${dirty} dòng chưa lưu` : 'Đã lưu mọi số đếm'}</span>
          {editable && (
            <button type="button" className="button button-ghost" disabled={dirty === 0 || save.isPending} onClick={() => save.mutate(undefined, { onSettled: refresh })}>
              {save.isPending ? 'Đang lưu…' : 'Lưu số đếm'}
            </button>
          )}
          {canConfirmStockAudits(access) && (
            <button
              type="button"
              className="button button-primary"
              disabled={dirty > 0 || a.countedItemCount < a.itemCount}
              title={a.countedItemCount < a.itemCount ? 'Đếm hết mọi dòng trước khi chốt' : dirty > 0 ? 'Lưu số đếm trước' : undefined}
              onClick={() => setDialog('confirm')}
            >
              Chốt kiểm kê
            </button>
          )}
        </div>
      )}
      {dialog && (
        <ConfirmDialog
          title={dialog === 'start' ? 'Bắt đầu đếm?' : dialog === 'confirm' ? `Chốt kiểm kê ${a.auditCode}?` : `Hủy phiên ${a.auditCode}?`}
          tone={dialog === 'cancel' ? 'danger' : 'primary'}
          confirmLabel={dialog === 'start' ? 'Bắt đầu đếm' : dialog === 'confirm' ? 'Chốt kiểm kê' : 'Hủy phiên'}
          message={
            dialog === 'start'
              ? 'Hệ thống chốt toàn bộ hàng đang theo dõi tồn của kho (kể cả hàng ngừng dùng) và số tồn lúc này. Nên kiểm kê lúc ít giao dịch.'
              : dialog === 'confirm'
                ? `Đã đếm ${a.countedItemCount}/${a.itemCount} · ${a.changedItemCount} dòng chênh lệch. Tồn kho được điều chỉnh bằng phiếu tự động; phiên đã chốt chỉ xem.`
                : 'Số đếm được giữ để tham khảo; tồn kho không thay đổi.'
          }
          reason={dialog === 'cancel' ? { label: 'Ghi chú', placeholder: 'Đếm lại sau khi xuất kho' } : undefined}
          busy={transition.isPending}
          error={transition.error ? tenantError(transition.error).message : null}
          onConfirm={(note) => transition.mutate({ kind: dialog, note })}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  )
}
