import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { useRealtimeStatus } from '../../../shared/realtime/RealtimeContext'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { Notice, PageTitle, Panel, StatusBadge } from '../../../shared/ui/Display'
import { FilterBar } from '../../../shared/ui/FilterBar'
import { Tabs } from '../../../shared/ui/Tabs'
import { toast } from '../../../shared/ui/toast'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { inventoryApi, inventoryKeys } from '../api/inventoryApi'
import { WarehouseFilter } from '../components/InventoryCommon'
import { canAcknowledgeAlert, canInventory, canWriteDocument } from '../policies/inventoryAccessPolicy'
import { alertCriteriaSchema, alertDefaults, stockItemId, type AlertCriteria, type LowStockAlert } from '../schemas'
import { alertStatusLabels, qty, resolutionLabels } from '../utils/inventoryLabels'
import '../inventory.css'

const NO_DATA = 'Không còn dữ liệu so sánh'
const current = (value: number | null | undefined, unit: string) => (value === null || value === undefined ? NO_DATA : qty(value, unit))

/** Cảnh báo tồn thấp: alert episodes (history); "Đã xem" never means restocked. */
export function AlertsPage() {
  const { access, scope } = useTenantAccess()
  const realtime = useRealtimeStatus()
  const navigate = useNavigate()
  const { criteria, update, reset, isFiltered } = useUrlCriteria<AlertCriteria>(alertCriteriaSchema, alertDefaults)
  const query = useQuery({
    queryKey: inventoryKeys.alertList(scope, criteria),
    queryFn: ({ signal }) => inventoryApi.alerts(scope!, criteria, signal),
    enabled: !!scope,
    placeholderData: keepPreviousData,
    refetchInterval: realtime.state === 'connected' ? false : 60_000,
  })
  const ack = useAcknowledge()
  const columns: Column<LowStockAlert>[] = [
    {
      key: 'item',
      header: 'Hàng hóa',
      render: (a) => (
        <div className="ui-cell-title">
          <strong>{a.ingredientName}</strong>
          <span>
            {a.warehouseName} · {a.ingredientSku ?? 'Không SKU'}
          </span>
        </div>
      ),
    },
    {
      key: 'trigger',
      header: 'Lúc cảnh báo',
      align: 'right',
      render: (a) => (
        <span title={formatDateTimeVi(a.triggeredAt)}>
          {qty(a.quantityAtTrigger, a.unit)} / ngưỡng {qty(a.thresholdQuantity, a.unit)}
        </span>
      ),
    },
    { key: 'now', header: 'Tồn hiện tại', align: 'right', hideOnNarrow: true, render: (a) => current(a.currentQuantity, a.unit) },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (a) => (
        <span title={a.resolutionReason ? resolutionLabels[a.resolutionReason] ?? a.resolutionReason : undefined}>
          <StatusBadge tone={alertStatusLabels[a.status].tone}>{alertStatusLabels[a.status].label}</StatusBadge>
        </span>
      ),
    },
    { key: 'at', header: 'Phát lúc', hideOnNarrow: true, render: (a) => formatDateTimeVi(a.triggeredAt) },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (a) =>
        a.status === 'OPEN' && canAcknowledgeAlert(access) ? (
          <div onClick={(event) => event.stopPropagation()}>
            <button type="button" className="button button-small button-secondary" disabled={ack.isPending && ack.variables?.id === a.id} onClick={() => ack.mutate(a)}>
              Đã xem
            </button>
          </div>
        ) : null,
    },
  ]
  return (
    <div className="ui-page">
      <PageTitle
        title="Cảnh báo tồn kho"
        description="Mỗi lần hàng chạm ngưỡng tạo một đợt cảnh báo; đợt tự kết thúc khi tồn vượt ngưỡng trở lại."
        actions={
          <Link className="button button-ghost" to="/app/inventory/low-stock">
            Hàng đang tồn thấp
          </Link>
        }
      />
      <Tabs<AlertCriteria['status']>
        label="Trạng thái cảnh báo"
        items={[
          { id: 'OPEN', label: 'Chưa xem' },
          { id: 'ACKNOWLEDGED', label: 'Đã xem' },
          { id: 'RESOLVED', label: 'Đã kết thúc' },
          { id: '', label: 'Tất cả' },
        ]}
        active={criteria.status}
        onChange={(status) => update({ status })}
      />
      <FilterBar search={criteria.q} onSearch={(q) => update({ q })} searchPlaceholder="Tìm tên hoặc SKU" isFiltered={isFiltered && (!!criteria.q || !!criteria.warehouseId)} onReset={reset}>
        <WarehouseFilter value={criteria.warehouseId} onChange={(warehouseId) => update({ warehouseId })} />
      </FilterBar>
      {criteria.status === 'OPEN' && canInventory(access, 'INVENTORY_VIEW') && (
        <p className="form-hint" style={{ margin: 0 }}>
          “Đã xem” chỉ ghi nhận bạn đã biết, không phải đã nhập kho. Cảnh báo kết thúc khi tồn vượt ngưỡng.
        </p>
      )}
      <DataTable
        caption="Cảnh báo tồn thấp"
        columns={columns}
        rows={query.data?.content}
        rowKey={(a) => a.id}
        loading={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        onRowClick={(a) => navigate(`/app/inventory/alerts/${encodeURIComponent(a.id)}`)}
        empty={{ title: 'Không có cảnh báo', description: criteria.status === 'OPEN' ? 'Không có cảnh báo nào chưa xem.' : 'Không có cảnh báo phù hợp.' }}
        page={criteria.page}
        totalPages={query.data?.totalPages ?? 0}
        onPageChange={(page) => update({ page })}
      />
    </div>
  )
}

function useAcknowledge() {
  const client = useQueryClient()
  const { scope } = useTenantAccess()
  return useTenantMutation({
    mutationFn: (s, alert: LowStockAlert) => inventoryApi.acknowledgeAlert(s, alert.id, alert.version),
    invalidate: (s) => [inventoryKeys.alerts(s)],
    success: 'Đã ghi nhận đã xem cảnh báo.',
    onSuccess: (next) => client.setQueryData(inventoryKeys.alert(scope, next.id), next),
  })
}

export function AlertDetailPage() {
  const { alertId = '' } = useParams()
  const { access, scope } = useTenantAccess()
  const query = useQuery({
    queryKey: inventoryKeys.alert(scope, alertId),
    queryFn: ({ signal }) => inventoryApi.alert(scope!, alertId, signal),
    enabled: !!scope,
  })
  const ack = useAcknowledge()
  if (query.isLoading) return <LoadingSkeleton rows={5} />
  const alert = query.data
  if (!alert) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const status = alertStatusLabels[alert.status]
  const itemId = stockItemId(alert)
  return (
    <div className="ui-page">
      <Link to="/app/inventory/alerts" className="muted" style={{ fontSize: 14 }}>
        ← Cảnh báo tồn kho
      </Link>
      <PageTitle
        title={alert.ingredientName}
        description={`Kho ${alert.warehouseName} (${alert.warehouseCode}) · phát lúc ${formatDateTimeVi(alert.triggeredAt)}`}
        actions={
          <div className="ui-inline-actions">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            {alert.status === 'OPEN' && canAcknowledgeAlert(access) && (
              <button type="button" className="button button-secondary" disabled={ack.isPending} onClick={() => ack.mutate(alert, { onError: (error) => toast.error(tenantError(error).message) })}>
                Đã xem
              </button>
            )}
            {canWriteDocument(access, 'RECEIPT') && alert.status !== 'RESOLVED' && (
              <Link
                className="button button-primary"
                to={`/app/inventory/stock-documents/new?type=RECEIPT&warehouseId=${encodeURIComponent(alert.warehouseId)}&itemId=${encodeURIComponent(itemId)}&name=${encodeURIComponent(alert.ingredientName)}&unit=${encodeURIComponent(alert.unit)}`}
              >
                Nhập kho
              </Link>
            )}
          </div>
        }
      />
      <div className="report-two" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Panel title="Lúc phát cảnh báo">
          <dl className="ui-facts">
            <dt>Tồn lúc đó</dt>
            <dd>{qty(alert.quantityAtTrigger, alert.unit)}</dd>
            <dt>Ngưỡng lúc đó</dt>
            <dd>{qty(alert.thresholdQuantity, alert.unit)}</dd>
            <dt>SKU</dt>
            <dd>{alert.ingredientSku ?? '—'}</dd>
          </dl>
          <p className="form-hint">Tên, SKU, đơn vị và ngưỡng được giữ theo lịch sử lúc phát cảnh báo.</p>
        </Panel>
        <Panel title="Hiện tại">
          <dl className="ui-facts">
            <dt>Tồn vật lý</dt>
            <dd>{current(alert.currentQuantity, alert.unit)}</dd>
            <dt>Đang giữ cho đơn</dt>
            <dd>{current(alert.reservedQuantity, alert.unit)}</dd>
            <dt>Khả dụng</dt>
            <dd>{current(alert.availableQuantity, alert.unit)}</dd>
            <dt>Ngưỡng hiện tại</dt>
            <dd>{current(alert.currentMinQuantity, alert.unit)}</dd>
          </dl>
        </Panel>
        <Panel title="Lịch sử đợt cảnh báo">
          <dl className="ui-facts">
            <dt>Phát lúc</dt>
            <dd>{formatDateTimeVi(alert.triggeredAt)}</dd>
            <dt>Đã xem lúc</dt>
            <dd>{alert.acknowledgedAt ? formatDateTimeVi(alert.acknowledgedAt) : 'Chưa có xác nhận đã xem.'}</dd>
            <dt>Kết thúc</dt>
            <dd>
              {alert.resolvedAt
                ? `${formatDateTimeVi(alert.resolvedAt)} · ${alert.resolutionReason ? resolutionLabels[alert.resolutionReason] ?? alert.resolutionReason : ''}`
                : 'Chưa kết thúc'}
            </dd>
          </dl>
        </Panel>
      </div>
      {alert.resolutionReason === 'INGREDIENT_UNIT_CHANGED' && (
        <Notice tone="warning">Đơn vị của hàng đã đổi. Kiểm tra lại ngưỡng cảnh báo vì hệ thống không tự quy đổi số.</Notice>
      )}
      <div className="ui-inline-actions" style={{ justifyContent: 'flex-start' }}>
        <Link className="button button-ghost" to={`/app/inventory/transactions?warehouseId=${encodeURIComponent(alert.warehouseId)}&ingredientId=${encodeURIComponent(itemId)}`}>
          Lịch sử giao dịch
        </Link>
        <Link className="button button-ghost" to={`/app/inventory/balances?warehouseId=${encodeURIComponent(alert.warehouseId)}&q=${encodeURIComponent(alert.ingredientSku ?? alert.ingredientName)}`}>
          Xem tồn / đặt ngưỡng
        </Link>
      </div>
    </div>
  )
}
