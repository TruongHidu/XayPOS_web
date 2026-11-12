import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { adminDashboardApi } from '../api/adminDashboardApi'
import { adminKeys } from '../api/adminKeys'
import { adminPaymentEventsApi } from '../api/adminPaymentsApi'
import { retryAdminQuery } from '../api/queryPolicy'
import { ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import type { AdminRevenue } from '../../../shared/types/adminPayments'
import { formatDateTime, formatVnd } from '../../../shared/utils/adminFormatting'
import { RevenueChart } from './RevenueChart'
import '../admin-payments.css'

const MONTHS = 12

/** Revenue block of the admin dashboard: headline numbers, monthly chart, package mix and renewals to chase. */
export function RevenueOverview({ canReviewPayments }: { canReviewPayments: boolean }) {
  const query = useQuery({
    queryKey: adminKeys.dashboard.revenue(MONTHS),
    queryFn: () => adminDashboardApi.revenue(MONTHS),
    retry: retryAdminQuery,
  })
  return (
    <section className="dashboard-section revenue-overview" aria-label="Doanh thu">
      <h3>Doanh thu</h3>
      {canReviewPayments && <PaymentReviewCallout />}
      {query.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data ? (
        <RevenueContent revenue={query.data} />
      ) : null}
    </section>
  )
}

function RevenueContent({ revenue }: { revenue: AdminRevenue }) {
  const change = percentChange(revenue.revenueThisMonth, revenue.revenuePreviousMonth)
  const maxMix = Math.max(...revenue.packageMix.map((p) => p.restaurants), 1)
  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Doanh thu định kỳ / tháng (MRR)" value={formatVnd(revenue.mrr)} note={`ARR ước tính ${formatVnd(revenue.mrr * 12)}`} />
        <Kpi
          label="Doanh thu tháng này"
          value={formatVnd(revenue.revenueThisMonth)}
          note={change === null ? 'Tháng trước chưa có doanh thu' : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% so với tháng trước`}
          tone={change === null ? undefined : change >= 0 ? 'up' : 'down'}
        />
        <Kpi label="Nhà hàng đang trả phí" value={String(revenue.payingRestaurants)} />
        <Kpi
          label="Rời bỏ 30 ngày qua"
          value={String(revenue.churnedLast30Days)}
          note="Hết gói và chưa gia hạn"
          tone={revenue.churnedLast30Days > 0 ? 'down' : undefined}
        />
      </div>
      <div className="card chart-card">
        <div className="section-heading">
          <div>
            <div className="eyebrow">{MONTHS} tháng gần nhất</div>
            <h4>Doanh thu theo tháng kích hoạt gói</h4>
          </div>
        </div>
        <RevenueChart series={revenue.series} />
        <p className="form-hint">
          Doanh thu tính theo giá gói tại thời điểm kích hoạt (múi giờ {revenue.zoneId}). Cập nhật lúc {formatDateTime(revenue.generatedAt)}.
        </p>
      </div>
      <div className="revenue-split">
        <div className="card chart-card">
          <div className="eyebrow">Đang hiệu lực</div>
          <h4>Phân bổ theo gói</h4>
          {revenue.packageMix.length === 0 ? (
            <p className="muted">Chưa có nhà hàng nào đang dùng gói.</p>
          ) : (
            <ul className="mix-list">
              {revenue.packageMix.map((p) => (
                <li key={p.packageCode}>
                  <div className="mix-label">
                    <strong>{p.packageName}</strong>
                    <span className="muted">
                      {p.restaurants} nhà hàng · {formatVnd(p.mrr)}/tháng
                    </span>
                  </div>
                  <div className="mix-track" aria-hidden="true">
                    <div className="mix-bar" style={{ width: `${(p.restaurants / maxMix) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card chart-card">
          <div className="eyebrow">14 ngày tới</div>
          <h4>Sắp hết hạn</h4>
          {revenue.expiringSoon.length === 0 ? (
            <p className="muted">Không có gói nào sắp hết hạn.</p>
          ) : (
            <ul className="expiring-list">
              {revenue.expiringSoon.map((item) => (
                <li key={item.restaurantId}>
                  <Link to={`/admin/restaurants/${encodeURIComponent(item.restaurantId)}`}>
                    <strong>{item.restaurantCode}</strong> · {item.restaurantName}
                  </Link>
                  <span className="muted">
                    {item.packageCode} · hết hạn {formatDateTime(item.endAt)}
                  </span>
                  <span className={`status-badge ${item.renewalPending ? 'status-active' : 'assignment-pending'}`}>
                    {item.renewalPending ? 'Đang gia hạn' : 'Chưa gia hạn'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}

function PaymentReviewCallout() {
  const query = useQuery({ queryKey: adminKeys.paymentReviewCounts(), queryFn: adminPaymentEventsApi.counts, retry: retryAdminQuery })
  const counts = query.data
  if (!counts || counts.paymentEvents + counts.purchases === 0) return null
  return (
    <div className="warning-banner review-callout" role="status">
      <strong>
        {counts.paymentEvents} giao dịch chuyển khoản và {counts.purchases} đơn mua gói đang chờ xử lý
      </strong>
      <span>
        Tiền của khách có thể đã vào tài khoản nhưng gói chưa được kích hoạt. <Link to="/admin/payment-reviews">Đối soát ngay →</Link>
      </span>
    </div>
  )
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'up' | 'down' }) {
  return (
    <div className="card kpi-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      {note && <span className={tone ? `kpi-note kpi-${tone}` : 'kpi-note'}>{note}</span>}
    </div>
  )
}

function percentChange(current: number, previous: number) {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}
