import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../../shared/components/AdminUi'
import { OrderFeedback } from '../../order/components/OrderUi'
import { useOrderAccess } from '../../order/hooks/useOrderAccess'
import { sameOrderScope } from '../../order/policies/orderAccessPolicy'
import { useAuthStore } from '../../auth/store/authStore'
import { formatMinor, moneyMinor } from '../../../shared/utils/scaledDecimal'
import { useQrReviewDecision, useQrReviewDetail } from '../hooks/useQrReview'
import { canApproveQr, canRejectQr, qrReviewStatusLabels } from '../policies/qrReviewPolicy'
import { qrReviewRejectSchema } from '../schemas'
import { orderError } from '../../order/utils/orderErrors'
import type { QrReviewDetail } from '../types'
import { QrReviewTableLabel } from './QrReviewQueue'
import '../qr-review.css'
import { useRemoteRevision } from '../../../shared/realtime/useRemoteRevision'
import { qrReviewKeys } from '../api/qrReviewKeys'

export function QrReviewModal({
  requestId,
  onClose,
  onDone,
}: {
  requestId: string
  onClose: () => void
  onDone: (message: string, orderId?: string) => void
}) {
  const detail = useQrReviewDetail(requestId)
  const { scope } = useOrderAccess()
  const revision = useRemoteRevision(qrReviewKeys.detail(scope, requestId))
  return (
    <Modal title="Xác nhận yêu cầu gọi món QR" onClose={onClose}>
      <div className="qr-review-modal-body">
        <OrderFeedback error={detail.error} onRetry={() => void detail.refetch()} />
        {detail.isLoading && <p role="status">Đang kiểm tra yêu cầu, giá món và phiên bàn...</p>}
        {detail.data && (
          <QrReviewForm
            key={requestId}
            detail={detail.data}
            revision={revision}
            refreshing={detail.isFetching}
            readFailed={detail.isError}
            refresh={async () => {
              const result = await detail.refetch()
              return result.isError ? undefined : result.data
            }}
            onDone={onDone}
          />
        )}
      </div>
    </Modal>
  )
}
function QrReviewForm({
  detail: incoming,
  revision,
  refreshing,
  readFailed,
  refresh,
  onDone,
}: {
  detail: QrReviewDetail
  revision: number
  refreshing: boolean
  readFailed: boolean
  refresh: () => Promise<QrReviewDetail | undefined>
  onDone: (message: string, orderId?: string) => void
}) {
  const { access, scope } = useOrderAccess()
  const mutation = useQrReviewDecision()
  const lock = useRef(false)
  const [now, setNow] = useState(() => Date.now())
  const [confirmedGroup, setConfirmedGroup] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [needsReview, setNeedsReview] = useState(false)
  const [baseline, setBaseline] = useState(() => ({ detail: incoming, revision }))
  const detail = baseline.detail
  const remotelyChanged =
    revision !== baseline.revision ||
    incoming.reviewContextHash !== detail.reviewContextHash ||
    incoming.request.version !== detail.request.version
  const mustReview = needsReview || remotelyChanged
  const request = detail.request
  const sessionId = detail.reviewContext?.currentSessionId
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const busy = mutation.isPending
  const expired = request.expired || Date.parse(request.expiresAt) <= now
  const canApprove = !readFailed && canApproveQr(access, detail, now)
  const canReject = !readFailed && canRejectQr(access, request)
  const reviewAgain = async () => {
    if (busy) return
    setConfirmedGroup(false)
    setNeedsReview(true)
    const updated = await refresh()
    if (updated) {
      setBaseline({ detail: updated, revision })
      setNeedsReview(false)
      setError(null)
    }
  }
  const decide = async (kind: 'approve' | 'reject') => {
    if (
      lock.current ||
      refreshing ||
      readFailed ||
      mustReview ||
      (kind === 'approve' && (!canApprove || (sessionId && !confirmedGroup)))
    )
      return
    if (kind === 'reject' && !canReject) return
    if (kind === 'reject') {
      const validated = qrReviewRejectSchema.safeParse({ expectedRequestVersion: request.version, reason })
      if (!validated.success) {
        setError(validated.error)
        return
      }
    }
    lock.current = true
    setError(null)
    try {
      const result = await mutation.mutateAsync(kind === 'approve' ? { kind, detail } : { kind, detail, reason })
      if (!sameOrderScope(scope, useAuthStore.getState())) return
      if ('order' in result) onDone(`Đã xác nhận yêu cầu QR vào đơn ${result.order.orderCode}.`, result.approvedOrderId)
      else onDone('Đã từ chối yêu cầu gọi món QR.')
    } catch (failure) {
      if (!sameOrderScope(scope, useAuthStore.getState())) return
      setError(failure)
      setNeedsReview(true)
      setConfirmedGroup(false)
    } finally {
      lock.current = false
    }
  }
  const lines = detail.currentQuote?.lines ?? request.items
  const refusalMessage =
    detail.reasonCode === 'FORBIDDEN'
      ? 'Bạn chưa có đủ quyền xử lý yêu cầu này. Duyệt QR cần ORDER_CREATE và ORDER_UPDATE; mở bàn mới cần TABLE_OPEN.'
      : detail.reasonCode
        ? orderError(new Error(detail.reasonCode)).message
        : ''
  return (
    <>
      <div className="qr-review-summary">
        <span className="pos-badge pos-badge-qr">
          <QrReviewTableLabel request={request} />
        </span>
        <strong>{request.customerName || 'Khách tại bàn'}</strong>
        {request.customerPhone && <span>{request.customerPhone}</span>}
        <span>
          {qrReviewStatusLabels[incoming.request.status]}
          {request.status === 'PENDING' && expired ? ' · Đã hết hạn' : ''}
        </span>
        <small className="order-muted">
          Gửi lúc {new Date(request.createdAt).toLocaleString('vi-VN')} · Hạn{' '}
          {new Date(request.expiresAt).toLocaleTimeString('vi-VN')}
        </small>
      </div>
      {request.note && <p className="qr-review-note">Ghi chú: {request.note}</p>}
      <ul className="qr-review-detail-lines">
        {lines.map((line, index) => (
          <li key={`${line.itemId}:${index}`}>
            <div>
              <strong>{line.itemName}</strong>
              <span>
                {line.quantity} {line.unit} × {formatMinor(moneyMinor(line.unitPrice), request.currencyCode)}
              </span>
              {line.note && <small>{line.note}</small>}
            </div>
            <strong>{formatMinor(moneyMinor(line.lineTotal), request.currencyCode)}</strong>
          </li>
        ))}
      </ul>
      <div className="qr-review-amount">
        <span>Khách dự kiến</span>
        <strong>{formatMinor(moneyMinor(request.estimatedAmount), request.currencyCode)}</strong>
      </div>
      {detail.currentQuote && (
        <div className="qr-review-amount">
          <span>Giá xác nhận hiện tại</span>
          <strong>{formatMinor(moneyMinor(detail.currentQuote.amount), detail.currentQuote.currencyCode)}</strong>
        </div>
      )}
      {detail.currentQuote && moneyMinor(detail.currentQuote.amount) !== moneyMinor(request.estimatedAmount) && (
        <p className="qr-review-warning">
          Giá đã thay đổi so với lúc khách gửi. Kiểm tra với khách trước khi xác nhận.
        </p>
      )}
      {request.entryType === 'TABLE' && detail.canApprove && (
        <div className="qr-review-seating">
          {sessionId ? (
            <>
              <p>
                Nhận món vào phiên bàn đang phục vụ
                {detail.reviewContext?.guestCount ? ` · ${detail.reviewContext.guestCount} khách` : ''}.
              </p>
              <small className="order-muted">Mã phiên: {sessionId}</small>
              {detail.reviewContext?.currentOrder && (
                <p>
                  Món sẽ được thêm vào đơn hiện tại. Tổng đơn trước khi thêm:{' '}
                  {formatMinor(
                    moneyMinor(detail.reviewContext.currentOrder.totalAmount),
                    detail.reviewContext.currentOrder.currencyCode,
                  )}
                  .
                </p>
              )}
              <label className="qr-review-confirm-group">
                <input
                  type="checkbox"
                  checked={confirmedGroup}
                  disabled={busy || refreshing}
                  onChange={(event) => setConfirmedGroup(event.target.checked)}
                />
                Tôi đã kiểm tra yêu cầu thuộc đúng nhóm khách của phiên bàn này.
              </label>
            </>
          ) : (
            <p>Xác nhận sẽ mở phiên bàn mới và tạo đơn cho yêu cầu này.</p>
          )}
        </div>
      )}
      {request.entryType === 'RESTAURANT' && detail.canApprove && (
        <p className="qr-review-seating">Xác nhận sẽ tạo một đơn mang đi riêng cho yêu cầu này.</p>
      )}
      {!detail.canApprove && detail.reasonCode && (
        <p className="qr-review-warning" role="status">
          {refusalMessage === 'Đã xảy ra lỗi. Vui lòng thử lại.'
            ? 'Yêu cầu chưa đủ điều kiện xác nhận.'
            : refusalMessage}{' '}
          <small>({detail.reasonCode})</small>
        </p>
      )}
      {request.rejectionReason && <p>Lý do từ chối: {request.rejectionReason}</p>}
      {request.cancellationReason && <p>Lý do hủy: {request.cancellationReason}</p>}
      {error ? <OrderFeedback error={error} /> : null}
      {mustReview && (
        <p className="qr-review-warning">
          Kết quả hoặc dữ liệu đã thay đổi. Đọc lại yêu cầu trước khi quyết định tiếp; hệ thống không tự gửi lại thao
          tác.
        </p>
      )}
      <button
        type="button"
        className="button button-ghost"
        disabled={busy || refreshing}
        onClick={() => void reviewAgain()}
      >
        {refreshing ? 'Đang kiểm tra...' : 'Đọc lại yêu cầu'}
      </button>
      {request.status === 'PENDING' && (
        <>
          <div className="qr-review-approve-action">
            <button
              type="button"
              className="button button-primary"
              disabled={busy || refreshing || mustReview || !canApprove || (!!sessionId && !confirmedGroup)}
              onClick={() => void decide('approve')}
            >
              {busy ? 'Đang xử lý...' : 'Xác nhận yêu cầu'}
            </button>
          </div>
          {!canApprove && !detail.reasonCode && (
            <p className="order-muted">Bạn chưa có đủ quyền xác nhận yêu cầu này.</p>
          )}
          {canReject && (
            <details className="qr-review-reject">
              <summary>Từ chối yêu cầu</summary>
              <label>
                Lý do từ chối
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  disabled={busy}
                  rows={3}
                />
              </label>
              <button
                type="button"
                className="button button-ghost"
                disabled={busy || refreshing || mustReview || !reason.trim()}
                onClick={() => void decide('reject')}
              >
                Xác nhận từ chối
              </button>
            </details>
          )}
        </>
      )}
    </>
  )
}
