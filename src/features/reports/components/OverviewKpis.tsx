import { KpiGrid, Panel, StatCard } from '../../../shared/ui/Display'
import type { OverviewData } from '../schemas'
import { money } from '../utils/reportFormat'

/**
 * Tiền đã thu (payments by paidAt) and Doanh số đơn hoàn tất (orders by
 * completedAt) are different facts and stay separate (report-fe-sync.md).
 */
export function OverviewKpis({ data, currency, loading }: { data?: OverviewData; currency: string; loading?: boolean }) {
  return (
    <KpiGrid columns={4}>
      <StatCard
        label="Tiền đã thu"
        icon="wallet"
        loading={loading}
        value={money(data?.collections.collectedAmount, currency)}
        hint={data && `${data.collections.successfulPaymentCount} giao dịch · ${data.collections.paidOrderCount} đơn có thu tiền`}
      />
      <StatCard
        label="Doanh số đơn hoàn tất"
        icon="chart"
        tone="success"
        loading={loading}
        value={money(data?.orders.completedOrderSalesAmount, currency)}
        hint={data && `${data.orders.completedOrderCount} đơn hoàn tất`}
      />
      <StatCard
        label="Giá trị TB / đơn hoàn tất"
        icon="receipt"
        tone="info"
        loading={loading}
        value={money(data?.orders.averageCompletedOrderValue, currency)}
      />
      <StatCard
        label="Đơn tạo / đã hủy"
        icon="order"
        tone={data && data.orders.cancelledOrderCount > 0 ? 'warning' : 'neutral'}
        loading={loading}
        value={data ? `${data.orders.createdOrderCount} / ${data.orders.cancelledOrderCount}` : '—'}
        hint="Theo ngày tạo / ngày hủy"
      />
    </KpiGrid>
  )
}

export function CompletedBreakdown({ data, currency }: { data: OverviewData; currency: string }) {
  const orders = data.orders
  return (
    <Panel title="Cấu thành doanh số đơn hoàn tất">
      <dl className="report-breakdown">
        <div>
          <dt>Tạm tính</dt>
          <dd>{money(orders.completedSubtotalAmount, currency)}</dd>
        </div>
        <div>
          <dt>Giảm giá</dt>
          <dd>−{money(orders.completedDiscountAmount, currency)}</dd>
        </div>
        <div>
          <dt>Thuế</dt>
          <dd>{money(orders.completedTaxAmount, currency)}</dd>
        </div>
        <div>
          <dt>Phí dịch vụ</dt>
          <dd>{money(orders.completedServiceChargeAmount, currency)}</dd>
        </div>
        <div className="report-total">
          <dt>Doanh số đơn hoàn tất</dt>
          <dd>{money(orders.completedOrderSalesAmount, currency)}</dd>
        </div>
      </dl>
      <p className="report-hint" style={{ marginTop: 10 }}>
        Tiền đã thu tính theo thời điểm thanh toán; doanh số tính theo thời điểm hoàn tất đơn, nên hai số có thể khác nhau.
      </p>
    </Panel>
  )
}
