import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { PageTitle } from '../../../shared/ui/Display'
import { Icon } from '../../../shared/ui/Icon'
import { parseIsoDate, toIsoDate, formatIsoDate } from '../../../shared/ui/dateRange'
import { ErrorState } from '../../../shared/components/AdminUi'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { reportKeys, reportsApi } from '../api/reportsApi'
import { CompletedBreakdown, OverviewKpis } from '../components/OverviewKpis'
import '../reports.css'

const shift = (iso: string, days: number) => {
  const date = parseIsoDate(iso) ?? new Date()
  return toIsoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days))
}

/** Doanh thu ngày: one day's takings and completed sales (`?date=`, default today). */
export function DailyRevenuePage() {
  const { scope } = useTenantAccess()
  const [params, setParams] = useSearchParams()
  const today = toIsoDate(new Date())
  const requested = params.get('date')
  const date = requested && parseIsoDate(requested) ? requested : today
  const setDate = (next: string) => setParams(next === today ? {} : { date: next }, { replace: true })
  const query = useQuery({
    queryKey: reportKeys.daily(scope, date),
    queryFn: ({ signal }) => reportsApi.daily(scope!, date, signal),
    enabled: !!scope,
    retry: false,
    refetchInterval: date === today ? 60_000 : false,
  })
  const report = query.data
  const currency = report?.meta.currencyCode ?? 'VND'
  return (
    <div className="ui-page">
      <PageTitle
        title="Doanh thu ngày"
        description={
          report
            ? `${formatIsoDate(report.meta.fromDate)} · ${report.meta.timezone} · ${currency} · cập nhật ${formatDateTimeVi(report.meta.generatedAt)}`
            : 'Tiền đã thu và doanh số đơn hoàn tất trong một ngày.'
        }
        actions={
          <div className="report-day-nav">
            <button type="button" className="ui-icon-button" aria-label="Ngày trước" onClick={() => setDate(shift(date, -1))}>
              <Icon name="chevron-left" />
            </button>
            <label>
              <span className="sr-only">Chọn ngày</span>
              <input type="date" value={date} max={today} onChange={(event) => event.target.value && setDate(event.target.value)} />
            </label>
            <button
              type="button"
              className="ui-icon-button"
              aria-label="Ngày sau"
              disabled={date >= today}
              onClick={() => setDate(shift(date, 1))}
            >
              <Icon name="chevron-right" />
            </button>
            {date !== today && (
              <button type="button" className="button button-small button-ghost" onClick={() => setDate(today)}>
                Hôm nay
              </button>
            )}
            <button type="button" className="button button-small button-ghost" disabled={query.isFetching} onClick={() => void query.refetch()}>
              <Icon name="refresh" size={16} /> Tải lại
            </button>
          </div>
        }
      />
      {query.error && !report ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <OverviewKpis data={report?.data} currency={currency} loading={query.isLoading} />
          {report && <CompletedBreakdown data={report.data} currency={currency} />}
        </>
      )}
    </div>
  )
}
