import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { SeriesChart } from '../../../shared/charts/SeriesChart'
import { ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { KpiGrid, Panel, StatCard, StatusBadge } from '../../../shared/ui/Display'
import { FilterSelect, SearchInput } from '../../../shared/ui/FilterBar'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { canOrder } from '../../order/policies/orderAccessPolicy'
import { canViewInventory } from '../../inventory/policies/inventoryAccessPolicy'
import { GranularitySwitch } from '../../reports/components/ReportFilters'
import { bucketLabel } from '../../reports/utils/reportFormat'
import { cashbookApi, cashbookKeys } from '../api/cashbookApi'
import { useExpenseCategories, type CashbookRangeState } from '../hooks/useCashbook'
import { flowCriteriaSchema, flowDefaults, type CashbookEntry, type FlowCriteria } from '../schemas'
import { cashMoney, entryTypeLabels, methodLabels, sourceTypeLabels } from '../utils/cashbookLabels'

/**
 * Dòng tiền: period totals from `/summary` (never summed from the visible
 * page), the in/out series and the effective entries. All three share one filter.
 */
export function FlowTab({ range, onOpenExpense }: { range: CashbookRangeState; onOpenExpense: (id: string) => void }) {
  const { access, scope } = useTenantAccess()
  const { criteria, update, reset, isFiltered } = useUrlCriteria<FlowCriteria>(flowCriteriaSchema, flowDefaults)
  const categories = useExpenseCategories()
  const r = range.criteria
  const granularity = range.granularity

  const summary = useQuery({
    queryKey: cashbookKeys.summary(scope, r, criteria),
    queryFn: ({ signal }) => cashbookApi.summary(scope!, r, criteria, signal),
    enabled: !!scope,
    retry: false,
    placeholderData: keepPreviousData,
  })
  const series = useQuery({
    queryKey: cashbookKeys.series(scope, r, criteria, granularity),
    queryFn: ({ signal }) => cashbookApi.series(scope!, r, criteria, granularity, signal),
    enabled: !!scope,
    retry: false,
    placeholderData: keepPreviousData,
  })
  const entries = useQuery({
    queryKey: cashbookKeys.entries(scope, r, criteria),
    queryFn: ({ signal }) => cashbookApi.entries(scope!, r, criteria, signal),
    enabled: !!scope,
    retry: false,
    placeholderData: keepPreviousData,
  })

  const currency = summary.data?.meta.currencyCode ?? entries.data?.meta.currencyCode ?? 'VND'
  const s = summary.data?.data
  const showOrders = canOrder(access, 'ORDER_VIEW')
  const showStock = canViewInventory(access)

  const columns: Column<CashbookEntry>[] = [
    { key: 'at', header: 'Thời điểm', sortKey: 'occurredAt', render: (row) => formatDateTimeVi(row.occurredAt) },
    {
      key: 'code',
      header: 'Mã',
      sortKey: 'code',
      render: (row) => (
        <span className="cb-code">
          <strong>{row.code}</strong>
          <small>{sourceTypeLabels[row.sourceType] ?? row.sourceType}</small>
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Loại',
      render: (row) => <StatusBadge tone={row.type === 'INCOME' ? 'success' : 'danger'}>{entryTypeLabels[row.type]}</StatusBadge>,
    },
    { key: 'category', header: 'Danh mục', hideOnNarrow: true, render: (row) => row.categoryName },
    { key: 'method', header: 'Phương thức', hideOnNarrow: true, render: (row) => methodLabels[row.paymentMethod] ?? row.paymentMethod },
    {
      key: 'amount',
      header: 'Số tiền',
      sortKey: 'amount',
      align: 'right',
      render: (row) => (
        <span className={row.type === 'INCOME' ? 'cb-in' : 'cb-out'}>
          {row.type === 'INCOME' ? '+' : '−'}
          {cashMoney(row.amount, row.currencyCode)}
        </span>
      ),
    },
    { key: 'source', header: 'Chứng từ gốc', hideOnNarrow: true, render: (row) => <SourceLink row={row} showOrders={showOrders} showStock={showStock} /> },
  ]

  return (
    <div className="ui-section-stack">
      <div className="report-filters-row">
        <FilterSelect
          label="Loại"
          value={criteria.type}
          options={[
            { value: '', label: 'Thu và chi' },
            { value: 'INCOME', label: 'Chỉ thu' },
            { value: 'EXPENSE', label: 'Chỉ chi' },
          ]}
          onChange={(type) => update({ type })}
        />
        <FilterSelect
          label="Danh mục"
          value={criteria.categoryCode}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'SALES_COLLECTION', label: 'Thu bán hàng' },
            ...categories.rows.map((category) => ({ value: category.code, label: category.name })),
          ]}
          onChange={(categoryCode) => update({ categoryCode })}
        />
        <FilterSelect
          label="Phương thức"
          value={criteria.paymentMethod}
          options={[{ value: '', label: 'Tất cả' }, ...Object.entries(methodLabels).map(([value, label]) => ({ value: value as FlowCriteria['paymentMethod'], label }))]}
          onChange={(paymentMethod) => update({ paymentMethod })}
        />
        <SearchInput value={criteria.q} onChange={(q) => update({ q })} placeholder="Mã phiếu, mã đơn, tham chiếu…" />
        {isFiltered && (
          <button type="button" className="button button-small button-ghost" onClick={reset}>
            Bỏ lọc
          </button>
        )}
      </div>

      {summary.error && !summary.data ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          <KpiGrid columns={3}>
            <StatCard
              label="Tổng thu"
              icon="wallet"
              tone="success"
              loading={summary.isLoading}
              value={cashMoney(s?.totalIncomeAmount, currency)}
              hint={s ? `${s.incomeEntryCount.toLocaleString('vi-VN')} giao dịch thu` : undefined}
            />
            <StatCard
              label="Tổng chi"
              icon="receipt"
              tone="danger"
              loading={summary.isLoading}
              value={cashMoney(s?.totalExpenseAmount, currency)}
              hint={s ? `${s.expenseEntryCount.toLocaleString('vi-VN')} phiếu chi hiệu lực` : undefined}
            />
            <StatCard
              label="Chênh lệch thu chi"
              icon="cashbook"
              tone={s && s.netCashFlowAmount < 0 ? 'danger' : 'primary'}
              loading={summary.isLoading}
              value={cashMoney(s?.netCashFlowAmount, currency)}
              hint="Thu trừ chi trong kỳ; không phải lợi nhuận hay số dư quỹ."
            />
          </KpiGrid>
          {s && (
            <div className="cb-breakdown" aria-label="Chi tiết thu chi">
              <span>
                Thu bán hàng <b>{cashMoney(s.saleIncomeAmount, currency)}</b>
              </span>
              <span>
                Chi nhập hàng (có phiếu nhập) <b>{cashMoney(s.receiptLinkedExpenseAmount, currency)}</b>
              </span>
              <span>
                Chi khác <b>{cashMoney(s.otherExpenseAmount, currency)}</b>
              </span>
            </div>
          )}
        </>
      )}

      <Panel title="Thu chi theo thời gian" actions={<GranularitySwitch value={granularity} onChange={(value) => range.update({ granularity: value })} />}>
        {series.isLoading ? (
          <LoadingSkeleton rows={5} />
        ) : series.error && !series.data ? (
          <ErrorState error={series.error} onRetry={() => void series.refetch()} />
        ) : (
          <SeriesChart
            title="Tổng thu, tổng chi và chênh lệch"
            rows={series.data?.data ?? []}
            xLabel={granularity === 'DAY' ? 'Ngày' : 'Tháng'}
            x={(point) => bucketLabel(point.bucketStartDate, granularity)}
            series={[
              { key: 'income', label: 'Tổng thu', value: (point) => point.totalIncomeAmount, color: '#059669' },
              { key: 'expense', label: 'Tổng chi', value: (point) => point.totalExpenseAmount, color: '#ea580c' },
              { key: 'net', label: 'Chênh lệch', value: (point) => point.netCashFlowAmount, kind: 'line', color: '#0863be' },
            ]}
          />
        )}
      </Panel>

      <DataTable
        caption="Sổ thu chi"
        columns={columns}
        rows={entries.data?.data.content}
        rowKey={(row) => `${row.sourceType}:${row.sourceId}`}
        loading={entries.isFetching}
        error={entries.error}
        onRetry={() => void entries.refetch()}
        empty={{ title: 'Chưa có khoản thu chi', description: 'Không có giao dịch nào trong khoảng thời gian và bộ lọc này.' }}
        sort={{ by: criteria.sortBy, direction: criteria.direction }}
        onSort={(sort) => update({ sortBy: sort.by as FlowCriteria['sortBy'], direction: sort.direction })}
        onRowClick={(row) => (row.sourceType === 'EXPENSE_VOUCHER' ? onOpenExpense(row.sourceId) : undefined)}
        rowClassName={(row) => (row.sourceType === 'EXPENSE_VOUCHER' ? 'cb-clickable' : undefined)}
        page={criteria.page}
        totalPages={entries.data?.data.totalPages ?? 0}
        onPageChange={(page) => update({ page })}
      />
    </div>
  )
}

function SourceLink({ row, showOrders, showStock }: { row: CashbookEntry; showOrders: boolean; showStock: boolean }) {
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation()
  if (row.sourceType === 'ORDER_PAYMENT' && row.orderId) {
    return showOrders ? (
      <Link to={`/app/orders/${encodeURIComponent(row.orderId)}`} onClick={stop}>
        Đơn {row.orderCode ?? ''}
      </Link>
    ) : (
      <span>Đơn {row.orderCode ?? ''}</span>
    )
  }
  if (row.stockDocumentId) {
    const label = `Phiếu nhập ${row.sourceDocumentCode ?? ''}`
    return showStock ? (
      <Link to={`/app/inventory/stock-documents/${encodeURIComponent(row.stockDocumentId)}`} onClick={stop}>
        {label}
      </Link>
    ) : (
      <span>{label}</span>
    )
  }
  return <span className="ui-muted-cell">—</span>
}
