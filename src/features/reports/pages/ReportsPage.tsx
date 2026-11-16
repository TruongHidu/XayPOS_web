import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { SeriesChart } from '../../../shared/charts/SeriesChart'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { PageTitle, Panel, StatusBadge } from '../../../shared/ui/Display'
import { FilterSelect } from '../../../shared/ui/FilterBar'
import { Tabs } from '../../../shared/ui/Tabs'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { orderLabels } from '../../order/utils/orderLabels'
import { reportKeys, reportsApi } from '../api/reportsApi'
import { CompletedBreakdown, OverviewKpis } from '../components/OverviewKpis'
import { GranularitySwitch, ReportFilters } from '../components/ReportFilters'
import { useReportRange } from '../hooks/useReportRange'
import {
  reportOrdersCriteriaSchema,
  reportOrdersDefaults,
  topItemsCriteriaSchema,
  topItemsDefaults,
  type RangeCriteria,
  type ReportOrder,
  type ReportOrdersCriteria,
  type TopItem,
  type TopItemsCriteria,
} from '../schemas'
import { bucketLabel, dateBasisLabels, money, num, paymentMethodLabels, serviceTypeLabels, sourceChannelLabels } from '../utils/reportFormat'
import '../reports.css'

type ReportTab = 'overview' | 'items' | 'orders'

/** Báo cáo: range summary, revenue chart, payment methods, top items and order reconciliation. */
export function ReportsPage() {
  const range = useReportRange('last7')
  const [params, setParams] = useSearchParams()
  const tab = (['overview', 'items', 'orders'].includes(params.get('tab') ?? '') ? params.get('tab') : 'overview') as ReportTab
  const setTab = (next: ReportTab) =>
    setParams(
      (current) => {
        const result = new URLSearchParams(current)
        if (next === 'overview') result.delete('tab')
        else result.set('tab', next)
        return result
      },
      { replace: true },
    )
  return (
    <div className="ui-page">
      <PageTitle title="Báo cáo" description="Tiền đã thu, doanh số, món bán chạy và đối soát đơn theo khoảng ngày." />
      <ReportFilters range={range} />
      {!range.valid ? null : (
        <>
          <Tabs<ReportTab>
            label="Báo cáo"
            items={[
              { id: 'overview', label: 'Tổng quan' },
              { id: 'items', label: 'Món bán chạy' },
              { id: 'orders', label: 'Đối soát đơn' },
            ]}
            active={tab}
            onChange={setTab}
          />
          {tab === 'overview' && <OverviewTab range={range.criteria} granularity={range.granularity} onGranularity={(granularity) => range.update({ granularity })} />}
          {tab === 'items' && <TopItemsTab range={range.criteria} />}
          {tab === 'orders' && <OrdersTab range={range.criteria} />}
        </>
      )}
    </div>
  )
}

function OverviewTab({
  range,
  granularity,
  onGranularity,
}: {
  range: RangeCriteria
  granularity: 'DAY' | 'MONTH'
  onGranularity: (value: 'DAY' | 'MONTH') => void
}) {
  const { scope } = useTenantAccess()
  const summary = useQuery({
    queryKey: reportKeys.summary(scope, range),
    queryFn: ({ signal }) => reportsApi.summary(scope!, range, signal),
    enabled: !!scope,
    retry: false,
  })
  const series = useQuery({
    queryKey: reportKeys.series(scope, range, granularity),
    queryFn: ({ signal }) => reportsApi.series(scope!, range, granularity, signal),
    enabled: !!scope,
    retry: false,
  })
  const methods = useQuery({
    queryKey: reportKeys.paymentMethods(scope, range),
    queryFn: ({ signal }) => reportsApi.paymentMethods(scope!, range, signal),
    enabled: !!scope,
    retry: false,
  })
  if (summary.error && !summary.data) return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
  const currency = summary.data?.meta.currencyCode ?? 'VND'
  return (
    <div className="ui-section-stack">
      {summary.data && (
        <p className="report-hint">
          {summary.data.meta.timezone} · {currency} · cập nhật {formatDateTimeVi(summary.data.meta.generatedAt)}
        </p>
      )}
      <OverviewKpis data={summary.data?.data} currency={currency} loading={summary.isLoading} />
      <div className="report-two">
        <Panel title="Doanh thu theo thời gian" actions={<GranularitySwitch value={granularity} onChange={onGranularity} />}>
          {series.isLoading ? (
            <LoadingSkeleton rows={5} />
          ) : series.error ? (
            <ErrorState error={series.error} onRetry={() => void series.refetch()} />
          ) : (
            <SeriesChart
              title="Tiền đã thu và doanh số đơn hoàn tất"
              rows={series.data?.data ?? []}
              xLabel={granularity === 'DAY' ? 'Ngày' : 'Tháng'}
              x={(point) => bucketLabel(point.bucketStartDate, granularity)}
              series={[
                { key: 'collected', label: 'Tiền đã thu', value: (point) => point.collectedAmount },
                { key: 'sales', label: 'Doanh số hoàn tất', value: (point) => point.completedOrderSalesAmount, kind: 'line' },
              ]}
            />
          )}
        </Panel>
        <Panel title="Phương thức thanh toán">
          {methods.isLoading ? (
            <LoadingSkeleton rows={3} />
          ) : methods.error ? (
            <ErrorState error={methods.error} onRetry={() => void methods.refetch()} />
          ) : (
            <div className="report-methods">
              {(methods.data?.data ?? []).map((row) => (
                <div key={row.paymentMethod}>
                  <div className="report-method-head">
                    <strong>{paymentMethodLabels[row.paymentMethod] ?? row.paymentMethod}</strong>
                    <span>
                      {money(row.collectedAmount, currency)} · {row.percentage.toLocaleString('vi-VN')}%
                    </span>
                  </div>
                  <div className={`report-method-bar ${row.paymentMethod === 'TRANSFER' ? 'report-transfer' : ''}`} aria-hidden="true">
                    <span style={{ width: `${Math.min(100, Math.max(0, row.percentage))}%` }} />
                  </div>
                  <span className="report-hint">{row.successfulPaymentCount} giao dịch</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
      {summary.data && <CompletedBreakdown data={summary.data.data} currency={currency} />}
    </div>
  )
}

function TopItemsTab({ range }: { range: RangeCriteria }) {
  const { scope } = useTenantAccess()
  const { criteria, update } = useUrlCriteria<TopItemsCriteria>(topItemsCriteriaSchema, topItemsDefaults)
  const query = useQuery({
    queryKey: reportKeys.topItems(scope, range, criteria),
    queryFn: ({ signal }) => reportsApi.topItems(scope!, range, criteria, signal),
    enabled: !!scope,
    retry: false,
    placeholderData: keepPreviousData,
  })
  const currency = query.data?.meta.currencyCode ?? 'VND'
  const columns: Column<TopItem>[] = [
    { key: 'rank', header: '#', width: '48px', render: (row) => (query.data?.data.content.indexOf(row) ?? 0) + 1 + criteria.tpage * 20 },
    { key: 'name', header: 'Món', render: (row) => <strong>{row.itemName}</strong> },
    { key: 'quantity', header: 'Số lượng', sortKey: 'quantity', align: 'right', render: (row) => `${num(row.quantity)} ${row.unit}` },
    { key: 'sales', header: 'Tiền bán món', sortKey: 'itemSalesAmount', align: 'right', render: (row) => money(row.itemSalesAmount, currency) },
    { key: 'orders', header: 'Số đơn', align: 'right', hideOnNarrow: true, render: (row) => row.completedOrderCount },
  ]
  return (
    <div className="ui-section-stack">
      <p className="report-hint">Chỉ tính món trong các đơn hoàn tất. Tiền bán món chưa trừ giảm giá cấp đơn và không phải lợi nhuận.</p>
      <DataTable
        caption="Món bán chạy"
        columns={columns}
        rows={query.data?.data.content}
        rowKey={(row) => `${row.itemId ?? row.itemName}-${row.unit}`}
        loading={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{ title: 'Chưa bán được món nào', description: 'Không có đơn hoàn tất trong khoảng thời gian này.' }}
        sort={{ by: criteria.tsortBy, direction: criteria.tdirection }}
        onSort={(sort) => update({ tsortBy: sort.by as TopItemsCriteria['tsortBy'], tdirection: sort.direction })}
        page={criteria.tpage}
        totalPages={query.data?.data.totalPages ?? 0}
        onPageChange={(tpage) => update({ tpage })}
      />
    </div>
  )
}

const payTone = (status: string) => (status === 'PAID' ? 'success' : status === 'PARTIALLY_PAID' ? 'warning' : 'neutral')

function OrdersTab({ range }: { range: RangeCriteria }) {
  const { scope } = useTenantAccess()
  const { criteria, update } = useUrlCriteria<ReportOrdersCriteria>(reportOrdersCriteriaSchema, reportOrdersDefaults)
  const query = useQuery({
    queryKey: reportKeys.orders(scope, range, criteria),
    queryFn: ({ signal }) => reportsApi.orders(scope!, range, criteria, signal),
    enabled: !!scope,
    retry: false,
    placeholderData: keepPreviousData,
  })
  const currency = query.data?.meta.currencyCode ?? 'VND'
  const columns: Column<ReportOrder>[] = [
    {
      key: 'code',
      header: 'Mã đơn',
      render: (row) => (
        <Link to={`/app/orders/${encodeURIComponent(row.id)}`} onClick={(event) => event.stopPropagation()}>
          <strong>{row.orderCode}</strong>
        </Link>
      ),
    },
    { key: 'at', header: dateBasisLabels[criteria.dateBasis], sortKey: 'reportEventAt', render: (row) => formatDateTimeVi(row.reportEventAt) },
    {
      key: 'type',
      header: 'Loại / kênh',
      hideOnNarrow: true,
      render: (row) => `${serviceTypeLabels[row.serviceType] ?? row.serviceType} · ${sourceChannelLabels[row.sourceChannel] ?? row.sourceChannel}`,
    },
    { key: 'status', header: 'Trạng thái', render: (row) => <StatusBadge tone="info">{orderLabels[row.status] ?? row.status}</StatusBadge> },
    {
      key: 'payment',
      header: 'Thanh toán',
      hideOnNarrow: true,
      render: (row) => <StatusBadge tone={payTone(row.paymentStatus)}>{orderLabels[row.paymentStatus] ?? row.paymentStatus}</StatusBadge>,
    },
    { key: 'total', header: 'Tổng đơn', sortKey: 'totalAmount', align: 'right', render: (row) => money(row.totalAmount, currency) },
    ...(criteria.dateBasis === 'PAID'
      ? [{ key: 'collected', header: 'Thu trong kỳ', align: 'right' as const, render: (row: ReportOrder) => money(row.collectedAmountInRange, currency) }]
      : []),
  ]
  return (
    <div className="ui-section-stack">
      <div className="report-filters-row">
        <FilterSelect
          label="Lọc theo"
          value={criteria.dateBasis}
          options={Object.entries(dateBasisLabels).map(([value, label]) => ({ value: value as ReportOrdersCriteria['dateBasis'], label }))}
          onChange={(dateBasis) => update({ dateBasis: (dateBasis || 'CREATED') as ReportOrdersCriteria['dateBasis'] })}
        />
        <FilterSelect
          label="Trạng thái đơn"
          value={criteria.ostatus}
          options={[
            { value: '', label: 'Tất cả' },
            ...(['OPEN', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED'] as const).map((value) => ({ value, label: orderLabels[value] ?? value })),
          ]}
          onChange={(ostatus) => update({ ostatus })}
        />
        <FilterSelect
          label="Thanh toán"
          value={criteria.opayment}
          options={[
            { value: '', label: 'Tất cả' },
            ...(['UNPAID', 'PARTIALLY_PAID', 'PAID'] as const).map((value) => ({ value, label: orderLabels[value] ?? value })),
          ]}
          onChange={(opayment) => update({ opayment })}
        />
      </div>
      <DataTable
        caption="Đối soát đơn"
        columns={columns}
        rows={query.data?.data.content}
        rowKey={(row) => row.id}
        loading={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{ title: 'Không có đơn phù hợp', description: 'Thử đổi khoảng ngày hoặc bộ lọc.' }}
        sort={{ by: criteria.osortBy, direction: criteria.odirection }}
        onSort={(sort) => update({ osortBy: sort.by as ReportOrdersCriteria['osortBy'], odirection: sort.direction })}
        page={criteria.opage}
        totalPages={query.data?.data.totalPages ?? 0}
        onPageChange={(opage) => update({ opage })}
      />
    </div>
  )
}
