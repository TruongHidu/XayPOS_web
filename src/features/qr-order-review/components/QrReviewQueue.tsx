import { OrderFeedback, OrderPager } from '../../order/components/OrderUi'
import { formatMinor, moneyMinor } from '../../../shared/utils/scaledDecimal'
import { useQrReviewTable, type useQrReviewQueue } from '../hooks/useQrReview'
import type { QrReviewSummary } from '../types'
import '../qr-review.css'

export function QrReviewTableLabel({ request }: { request: QrReviewSummary }) {
  const table = useQrReviewTable(request.tableId)
  if (request.entryType === 'RESTAURANT') return <span>QR mang đi</span>
  return (
    <span title={request.tableId ?? undefined}>
      {table.data ? `${table.data.name} · ${table.data.code}` : 'QR tại bàn · ' + request.tableId?.slice(0, 8)}
    </span>
  )
}
function QrReviewCard({ request, onReview }: { request: QrReviewSummary; onReview: (id: string) => void }) {
  return (
    <article className="pos-order-card qr-review-card">
      <div className="qr-review-card-heading">
        <span className="pos-badge pos-badge-qr">
          <QrReviewTableLabel request={request} />
        </span>
        <span className="order-muted">
          {new Date(request.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <strong>{request.customerName || 'Khách tại bàn'}</strong>
      {request.customerPhone && <span>{request.customerPhone}</span>}
      <ul className="qr-review-line-preview">
        {request.items.slice(0, 3).map((line) => (
          <li key={line.id}>
            {line.quantity} × {line.itemName}
            {line.note && <small>{line.note}</small>}
          </li>
        ))}
      </ul>
      {request.items.length > 3 && <span className="order-muted">Và {request.items.length - 3} món khác</span>}
      {request.note && <p className="qr-review-note">{request.note}</p>}
      <div className="pos-card-price-row">
        <span className="order-muted">Tạm tính</span>
        <strong>{formatMinor(moneyMinor(request.estimatedAmount), request.currencyCode)}</strong>
      </div>
      <button type="button" className="button button-primary" onClick={() => onReview(request.requestId)}>
        Xem và xác nhận
      </button>
    </article>
  )
}
export function QrReviewQueue({
  query,
  page,
  onPage,
  onReview,
  searching,
}: {
  query: ReturnType<typeof useQrReviewQueue>
  page: number
  onPage: (page: number) => void
  onReview: (id: string) => void
  searching: boolean
}) {
  return (
    <section className="qr-review-queue" aria-label="Khách gọi món qua QR">
      <div className="qr-review-queue-heading">
        <h4>Khách gọi qua QR</h4>
        <span className="pos-badge pos-badge-qr">{query.data?.totalElements ?? 0} yêu cầu</span>
      </div>
      <p className="order-muted">Xem món và giá trước khi nhận vào đơn. Tự cập nhật mỗi 10 giây.</p>
      {searching && <p className="order-muted">Tìm mã đơn chỉ áp dụng cho đơn đã tạo.</p>}
      <OrderFeedback error={query.error} onRetry={() => void query.refetch()} />
      {query.isLoading && <p role="status">Đang tải yêu cầu QR...</p>}
      {query.data?.content.map((request) => (
        <QrReviewCard key={request.requestId} request={request} onReview={onReview} />
      ))}
      {!query.isLoading && !query.error && query.data?.content.length === 0 && (
        <p className="order-muted">Chưa có yêu cầu QR chờ xác nhận.</p>
      )}
      <OrderPager page={page} totalPages={query.data?.totalPages ?? 0} loading={query.isFetching} onPage={onPage} />
      {page > 0 && query.data?.content.length === 0 && (
        <button type="button" className="button button-ghost" onClick={() => onPage(0)}>
          Về trang yêu cầu đầu tiên
        </button>
      )}
    </section>
  )
}
