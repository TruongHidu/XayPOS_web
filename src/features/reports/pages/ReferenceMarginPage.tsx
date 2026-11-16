import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { SeriesChart } from '../../../shared/charts/SeriesChart'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { KpiGrid, Notice, PageTitle, Panel, StatCard, StatusBadge, type Tone } from '../../../shared/ui/Display'
import { FilterSelect } from '../../../shared/ui/FilterBar'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { reportKeys, reportsApi } from '../api/reportsApi'
import { GranularitySwitch, ReportFilters } from '../components/ReportFilters'
import { useReportRange } from '../hooks/useReportRange'
import {
  marginOrdersCriteriaSchema,
  marginOrdersDefaults,
  type MarginOrder,
  type MarginOrdersCriteria,
  type MarginSummary,
  type RangeCriteria,
} from '../schemas'
import { bucketLabel, costIssueLabels, coverageLabels, money, pct, serviceTypeLabels } from '../utils/reportFormat'
import '../reports.css'

const coverageTone: Record<string, Tone> = { COMPLETE: 'success', PARTIAL: 'warning', UNAVAILABLE: 'danger', NO_DATA: 'neutral' }

/**
 * Giá vốn & lãi tham chiếu: reference cost frozen when each line was accepted.
 * Margins only cover fully costed completed orders; missing costs are unknown,
 * never zero. Not actual COGS or net profit.
 */
export function ReferenceMarginPage() {
  const { scope } = useTenantAccess()
  const range = useReportRange('last7')
  const summary = useQuery({
    queryKey: reportKeys.marginSummary(scope, range.criteria),
    queryFn: ({ signal }) => reportsApi.marginSummary(scope!, range.criteria, signal),
    enabled: !!scope && range.valid,
    retry: false,
  })
  const series = useQuery({
    queryKey: reportKeys.marginSeries(scope, range.criteria, range.granularity),
    queryFn: ({ signal }) => reportsApi.marginSeries(scope!, range.criteria, range.granularity, signal),
    enabled: !!scope && range.valid,
    retry: false,
  })
  const data = summary.data?.data
  const currency = summary.data?.meta.currencyCode ?? 'VND'
  return (
    <div className="ui-page">
      <PageTitle
        title="Giá vốn & lãi tham chiếu"
        description="Lãi gộp tính trên giá vốn tham chiếu chốt lúc nhận món, chỉ cho các đơn hoàn tất đủ giá vốn. Không phải giá vốn thực tế hay lợi nhuận ròng."
      />
      <ReportFilters range={range} meta={summary.data?.meta} />
      {!range.valid ? null : summary.error && !data ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          <KpiGrid columns={4}>
            <StatCard label="Doanh thu thuần (mọi đơn hoàn tất)" icon="chart" loading={summary.isLoading} value={money(data?.netSalesAmount, currency)} hint={data && `${data.completedOrderCount} đơn hoàn tất`} />
            <StatCard
              label="Doanh thu thuần đủ giá vốn"
              icon="check"
              tone="info"
              loading={summary.isLoading}
              value={money(data?.coveredNetSalesAmount, currency)}
              hint={data && `${data.fullyCostedOrderCount} đơn · phủ ${pct(data.orderCoveragePercent)}`}
            />
            <StatCard label="Giá vốn tham chiếu" icon="wallet" tone="warning" loading={summary.isLoading} value={money(data?.coveredReferenceCostAmount, currency)} />
            <StatCard
              label="Lãi gộp tham chiếu"
              icon="report"
              tone={data && data.coveredReferenceMarginAmount < 0 ? 'danger' : 'success'}
              loading={summary.isLoading}
              value={money(data?.coveredReferenceMarginAmount, currency)}
              hint={data && `Tỷ lệ ${pct(data.coveredReferenceMarginPercent)}`}
            />
          </KpiGrid>
          {data && <CoverageNotice summary={data} />}
          <Panel title="Lãi gộp tham chiếu theo thời gian" actions={<GranularitySwitch value={range.granularity} onChange={(granularity) => range.update({ granularity })} />}>
            {series.isLoading ? (
              <LoadingSkeleton rows={5} />
            ) : series.error ? (
              <ErrorState error={series.error} onRetry={() => void series.refetch()} />
            ) : (
              <SeriesChart
                title="Doanh thu thuần đủ giá vốn, giá vốn và lãi gộp tham chiếu"
                rows={series.data?.data ?? []}
                xLabel={range.granularity === 'DAY' ? 'Ngày' : 'Tháng'}
                x={(point) => bucketLabel(point.bucketStartDate, range.granularity)}
                series={[
                  { key: 'net', label: 'Doanh thu thuần đủ giá vốn', value: (point) => point.coveredNetSalesAmount },
                  { key: 'cost', label: 'Giá vốn tham chiếu', value: (point) => point.coveredReferenceCostAmount, color: '#ea580c' },
                  { key: 'margin', label: 'Lãi gộp tham chiếu', value: (point) => point.coveredReferenceMarginAmount, kind: 'line', color: '#059669' },
                ]}
              />
            )}
          </Panel>
          <MarginOrders range={range.criteria} currency={currency} />
          {summary.data && (
            <p className="report-hint">
              Cơ sở: ngày hoàn tất · {summary.data.meta.timezone} · {currency} · cập nhật {formatDateTimeVi(summary.data.meta.generatedAt)}
            </p>
          )}
        </>
      )}
    </div>
  )

}

function MarginOrders({ range, currency }: { range: RangeCriteria; currency: string }) {
  const { scope } = useTenantAccess()
  const { criteria, update } = useUrlCriteria<MarginOrdersCriteria>(marginOrdersCriteriaSchema, marginOrdersDefaults)
  const navigate = useNavigate()
  const orders = useQuery({
    queryKey: reportKeys.marginOrders(scope, range, criteria),
    queryFn: ({ signal }) => reportsApi.marginOrders(scope!, range, criteria, signal),
    enabled: !!scope,
    retry: false,
    placeholderData: keepPreviousData,
  })
  const columns: Column<MarginOrder>[] = [
    { key: 'code', header: 'Mã đơn', render: (row) => <strong>{row.orderCode}</strong> },
    { key: 'at', header: 'Hoàn tất lúc', sortKey: 'completedAt', render: (row) => formatDateTimeVi(row.completedAt) },
    { key: 'type', header: 'Loại', hideOnNarrow: true, render: (row) => serviceTypeLabels[row.serviceType] ?? row.serviceType },
    { key: 'net', header: 'Doanh thu thuần', sortKey: 'netSalesAmount', align: 'right', render: (row) => money(row.netSalesAmount, currency) },
    {
      key: 'cost',
      header: 'Giá vốn TC',
      sortKey: 'referenceCostAmount',
      align: 'right',
      render: (row) => (row.referenceCostAmount === null ? <span className="ui-muted-cell">Chưa đủ</span> : money(row.referenceCostAmount, currency)),
    },
    {
      key: 'margin',
      header: 'Lãi gộp TC',
      sortKey: 'referenceMarginAmount',
      align: 'right',
      render: (row) =>
        row.referenceMarginAmount === null ? (
          <span className="ui-muted-cell">—</span>
        ) : (
          <span className={row.referenceMarginAmount < 0 ? 'report-negative' : 'report-positive'}>
            {money(row.referenceMarginAmount, currency)} ({pct(row.referenceMarginPercent)})
          </span>
        ),
    },
    {
      key: 'coverage',
      header: 'Giá vốn',
      render: (row) => (
        <span title={row.costIssues.map((issue) => costIssueLabels[issue.code] ?? issue.code).join(', ')}>
          <StatusBadge tone={coverageTone[row.costCoverageStatus] ?? 'neutral'}>
            {coverageLabels[row.costCoverageStatus] ?? row.costCoverageStatus} ({row.fullyCostedItemCount}/{row.eligibleItemCount})
          </StatusBadge>
        </span>
      ),
    },
  ]
  return (
    <Panel
      title="Đơn đối chiếu"
      actions={
        <FilterSelect
          label="Giá vốn"
          value={criteria.coverage}
          options={[
            { value: 'ALL', label: 'Tất cả đơn' },
            { value: 'COMPLETE', label: 'Đủ giá vốn' },
            { value: 'EXCLUDED', label: 'Bị loại (thiếu giá vốn)' },
          ]}
          onChange={(coverage) => update({ coverage: (coverage || 'ALL') as MarginOrdersCriteria['coverage'] })}
        />
      }
    >
      <DataTable
        caption="Đơn đối chiếu giá vốn"
        columns={columns}
        rows={orders.data?.data.content}
        rowKey={(row) => row.orderId}
        loading={orders.isFetching}
        error={orders.error}
        onRetry={() => void orders.refetch()}
        onRowClick={(row) => navigate(`/app/orders/${encodeURIComponent(row.orderId)}`)}
        empty={{ title: 'Không có đơn đối chiếu', description: 'Không có đơn hoàn tất phù hợp bộ lọc.' }}
        sort={{ by: criteria.msortBy, direction: criteria.mdirection }}
        onSort={(sort) => update({ msortBy: sort.by as MarginOrdersCriteria['msortBy'], mdirection: sort.direction })}
        page={criteria.mpage}
        totalPages={orders.data?.data.totalPages ?? 0}
        onPageChange={(mpage) => update({ mpage })}
      />
    </Panel>
  )
}

function CoverageNotice({ summary }: { summary: MarginSummary }) {
  if (summary.costCoverageStatus === 'COMPLETE') return null
  if (summary.costCoverageStatus === 'NO_DATA') return <Notice tone="info">Chưa có đơn hoàn tất trong khoảng thời gian này.</Notice>
  return (
    <Notice tone={summary.costCoverageStatus === 'UNAVAILABLE' ? 'danger' : 'warning'} title={coverageLabels[summary.costCoverageStatus]}>
      {summary.excludedOrderCount} / {summary.completedOrderCount} đơn bị loại khỏi lãi gộp vì thiếu giá vốn (không tính là 0 đồng):
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {summary.costIssues.map((issue) => (
          <li key={issue.code}>
            {costIssueLabels[issue.code] ?? issue.code}: {issue.orderCount} đơn, {issue.itemCount} món
          </li>
        ))}
      </ul>
      Cấu hình giá vốn món/nguyên liệu trong Thực đơn để các đơn sau được tính.
    </Notice>
  )
}
