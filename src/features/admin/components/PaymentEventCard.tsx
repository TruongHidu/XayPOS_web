import { Link } from 'react-router-dom'
import type { PaymentEventSummary } from '../../../shared/types/adminPayments'
import { formatDateTime } from '../../../shared/utils/adminFormatting'
import { reviewReasonInfo } from '../utils/paymentLabels'
import { EventStateBadge, Money, PurchaseStatusBadge, ReasonTag } from './PaymentUi'
import { PaymentEventActions } from './PaymentEventActions'

/** One bank transfer: money, where it came from, what it is linked to, why it is parked and what can be done. */
export function PaymentEventCard({
  event,
  canReview,
  onDone,
}: {
  event: PaymentEventSummary
  canReview: boolean
  onDone: (message: string) => void
}) {
  const hint = event.state === 'REVIEW_REQUIRED' && event.reviewReason ? reviewReasonInfo[event.reviewReason]?.hint : null
  return (
    <article className="card payment-event-card" aria-label={`Giao dịch ${event.bankReference ?? event.id}`}>
      <div className="pe-money">
        <span className={event.direction === 'in' ? 'pe-amount' : 'pe-amount pe-out'}>
          {event.direction === 'out' && '−'}
          <Money amount={event.amount} />
        </span>
        <span className="muted">{formatDateTime(event.occurredAt)}</span>
        <EventStateBadge state={event.state} />
      </div>
      <div className="pe-body">
        <div className="pe-content" title="Nội dung chuyển khoản">
          “{event.transferContent || 'Không có nội dung'}”
        </div>
        <dl className="pe-facts">
          <div>
            <dt>Mã GD ngân hàng</dt>
            <dd>{event.bankReference ?? '—'}</dd>
          </div>
          <div>
            <dt>Mã thanh toán</dt>
            <dd>{event.paymentReference ? <code className="code-pill">{event.paymentReference}</code> : '—'}</dd>
          </div>
          <div>
            <dt>Nhà hàng</dt>
            <dd>
              {event.restaurant ? (
                <Link to={`/admin/restaurants/${encodeURIComponent(event.restaurant.id)}`}>
                  {event.restaurant.code} · {event.restaurant.name}
                </Link>
              ) : (
                <span className="muted">Chưa xác định</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Đơn mua gói</dt>
            <dd>
              {event.purchaseId ? (
                <Link className="pe-purchase" to={`/admin/purchases/${encodeURIComponent(event.purchaseId)}`}>
                  <Money amount={event.purchaseAmount} />
                  {event.purchaseStatus && <PurchaseStatusBadge status={event.purchaseStatus} />}
                </Link>
              ) : (
                <span className="muted">Chưa gắn đơn</span>
              )}
            </dd>
          </div>
        </dl>
        {event.state === 'CLOSED' && (
          <p className="form-hint">
            Đóng bởi <strong>{event.reviewerName ?? '—'}</strong> lúc {formatDateTime(event.reviewedAt)} · {event.reviewNote} ·{' '}
            <code>{event.resolutionReference}</code>
          </p>
        )}
      </div>
      <div className="pe-review">
        {event.reviewReason && event.state !== 'REVIEW_REQUIRED' && <span className="muted">Lý do ban đầu</span>}
        <ReasonTag reason={event.reviewReason} />
        {hint && <p className="form-hint">{hint}</p>}
        {canReview && <PaymentEventActions event={event} onDone={onDone} />}
      </div>
    </article>
  )
}
