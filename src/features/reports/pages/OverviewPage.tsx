import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { tenantGet } from '../../../shared/api/tenantApi'
import { pageSchema } from '../../../shared/api/tenantSchemas'
import { PageTitle, Panel, StatCard } from '../../../shared/ui/Display'
import { Icon } from '../../../shared/ui/Icon'
import { ErrorState } from '../../../shared/components/AdminUi'
import { useRealtimeStatus } from '../../../shared/realtime/RealtimeContext'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { useAuthStore } from '../../auth/store/authStore'
import { kitchenApi } from '../../kitchen/api/kitchenApi'
import { canKitchenView } from '../../kitchen/policies/kitchenAccessPolicy'
import { orderKeys } from '../../order/api/orderKeys'
import { useTakeawayCount } from '../../order/hooks/useTakeawayCount'
import { canTakeawayOrders } from '../../order/policies/orderAccessPolicy'
import { useQrPendingCount } from '../../qr-order-review/hooks/useQrPendingCount'
import { canTable } from '../../tables/policies/tableAccessPolicy'
import { tableKeys } from '../../tables/api/tablesAdminApi'
import { reportKeys, reportsApi } from '../api/reportsApi'
import { OverviewKpis } from '../components/OverviewKpis'
import { canDetailReport } from '../policies/reportAccessPolicy'
import { toIsoDate } from '../../../shared/ui/dateRange'
import '../reports.css'

const countPage = pageSchema(z.unknown())

/**
 * Tổng quan: today's takings (it follows the daily report, as in the app)
 * plus what is happening right now, each card only for staff who may see it.
 */
export function OverviewPage() {
  const { access, scope } = useTenantAccess()
  const user = useAuthStore((state) => state.user)
  const realtime = useRealtimeStatus()
  const navigate = useNavigate()
  const live = realtime.state === 'connected'
  const today = toIsoDate(new Date())

  const daily = useQuery({
    queryKey: reportKeys.daily(scope, today),
    queryFn: ({ signal }) => reportsApi.daily(scope!, undefined, signal),
    enabled: !!scope,
    retry: false,
    refetchInterval: 60_000,
  })
  const servingTables = useQuery({
    queryKey: [...tableKeys.tables(scope), 'serving-count'],
    queryFn: ({ signal }) => tenantGet(scope!, '/tables', countPage, { signal, params: { occupied: true, page: 0, size: 1 } }),
    enabled: !!scope && canTable(access, 'TABLE_VIEW'),
    retry: false,
    refetchInterval: live ? false : 30_000,
  })
  const kitchenPending = useQuery({
    queryKey: orderKeys.kitchen(scope, { status: 'PENDING', count: true }),
    queryFn: ({ signal }) => kitchenApi.items(scope!, { status: 'PENDING', page: 0, size: 1 }, signal),
    enabled: !!scope && canKitchenView(access),
    retry: false,
    refetchInterval: live ? false : 30_000,
  })
  const takeaway = useTakeawayCount()
  const qrPending = useQrPendingCount()

  const currency = daily.data?.meta.currencyCode ?? 'VND'
  const hour = new Date().getHours()
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'

  return (
    <div className="ui-page">
      <PageTitle
        title={`${greeting}, ${user?.name ?? ''}`}
        description={
          daily.data
            ? `Hôm nay tại ${user?.restaurantName ?? 'nhà hàng'} · cập nhật ${formatDateTimeVi(daily.data.meta.generatedAt)}`
            : 'Tình hình kinh doanh hôm nay.'
        }
        actions={
          <Link className="button button-ghost" to="/app/daily-revenue">
            Xem chi tiết doanh thu
          </Link>
        }
      />
      {daily.error && !daily.data ? (
        <ErrorState error={daily.error} onRetry={() => void daily.refetch()} />
      ) : (
        <OverviewKpis data={daily.data?.data} currency={currency} loading={daily.isLoading} />
      )}

      <Panel title="Đang diễn ra">
        <div className="overview-live">
          {canTable(access, 'TABLE_VIEW') && (
            <StatCard
              label="Bàn đang phục vụ"
              icon="table"
              tone="warning"
              loading={servingTables.isLoading}
              value={servingTables.data?.totalElements ?? '—'}
              onClick={() => navigate('/app/tables?state=serving')}
            />
          )}
          {canTakeawayOrders(access) && (
            <StatCard label="Đơn mang đi đang phục vụ" icon="takeaway" tone="info" loading={takeaway === undefined} value={takeaway ?? '—'} onClick={() => navigate('/app/takeaway')} />
          )}
          {qrPending !== undefined && (
            <StatCard
              label="Yêu cầu QR chờ duyệt"
              icon="qr"
              tone={qrPending > 0 ? 'danger' : 'neutral'}
              value={qrPending}
              hint={qrPending > 0 ? 'Duyệt tại Đơn hàng' : undefined}
              onClick={() => navigate('/app/orders')}
            />
          )}
          {canKitchenView(access) && (
            <StatCard
              label="Món chờ bếp nấu"
              icon="kitchen"
              tone="primary"
              loading={kitchenPending.isLoading}
              value={kitchenPending.data?.totalElements ?? '—'}
              onClick={() => navigate('/app/kitchen')}
            />
          )}
        </div>
      </Panel>

      {canDetailReport(access) && (
        <div className="overview-links">
          <Link className="button button-ghost" to="/app/reports">
            <Icon name="report" size={16} /> Báo cáo theo khoảng ngày
          </Link>
          <Link className="button button-ghost" to="/app/reports?tab=items">
            <Icon name="chart" size={16} /> Món bán chạy
          </Link>
        </div>
      )}
    </div>
  )
}
