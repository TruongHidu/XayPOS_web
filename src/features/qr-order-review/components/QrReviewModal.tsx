import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../../shared/components/AdminUi'
import { OrderFeedback } from '../../order/components/OrderUi'
import { useOrderAccess } from '../../order/hooks/useOrderAccess'
import { sameOrderScope } from '../../order/policies/orderAccessPolicy'
import { useAuthStore } from '../../auth/store/authStore'
import { formatMinor, moneyMinor } from '../../../shared/utils/scaledDecimal'
import { useQrReviewDecision, useQrReviewDetail } from '../hooks/useQrReview'
import {
  canApproveQr,
  canRejectQr,
  isAllLinesUnavailable,
  qrCancellationLabel,
  qrReviewStatusLabels,
} from '../policies/qrReviewPolicy'
import { qrReviewRejectSchema } from '../schemas'
import { orderError } from '../../order/utils/orderErrors'
import { stockShortageOf } from '../../order/utils/stockShortage'
import type { QrReviewDetail } from '../types'
import {
  DEFAULT_LEAVE_OUT_REASON,
  acceptedLines,
  acceptedTotal,
  excludedItemsOf,
  initialSelection,
  missingReason,
  priceChanged,
  rejectReasonFrom,
  untickMenuItems,
} from '../utils/qrReviewSelection'
import { QrReviewTableLabel } from './QrReviewQueue'
import { QrReviewQuoteLines, QrReviewRequestItems } from './QrReviewLines'
import { QrStockShortage } from './QrStockShortage'
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
  // null = untouched: the form shows a reason pre-filled from the left-out lines.
  const [reason, setReason] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [needsReview, setNeedsReview] = useState(false)
  const [baseline, setBaseline] = useState(() => ({ detail: incoming, revision }))
  const [selection, setSelection] = useState(() => initialSelection(incoming.currentQuote?.lines ?? []))
  const [rejectOpen, setRejectOpen] = useState(false)
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
  const quoteLines = detail.currentQuote?.lines ?? []
  // Staff pick lines only on a pending request they may approve; otherwise the lines are read-only.
  const editable = request.status === 'PENDING' && canApprove && quoteLines.length > 0
  const accepted = editable ? acceptedLines(quoteLines, selection).length : quoteLines.length
  const allLeftOut = editable && accepted === 0
  const reasonMissing = editable && missingReason(quoteLines, selection)
  // Nothing left to take (staff left every line out, or every line is unavailable): rejecting is the only move.
  const onlyReject = allLeftOut || (!detail.canApprove && isAllLinesUnavailable(detail.reasonCode))
  const rejectShown = onlyReject || rejectOpen
  const rejectReason =
    reason ?? (onlyReject ? (editable ? rejectReasonFrom(quoteLines, selection) : DEFAULT_LEAVE_OUT_REASON) : '')
  const reviewAgain = async () => {
    if (busy) return
    setConfirmedGroup(false)
    setNeedsReview(true)
    const updated = await refresh()
    if (updated) {
      setBaseline({ detail: updated, revision })
      // Keep what staff left out; lines that became unavailable are left out now.
      setSelection((current) => initialSelection(updated.currentQuote?.lines ?? [], current))
      setNeedsReview(false)
      setError(null)
    }
  }
  const decide = async (kind: 'approve' | 'reject') => {
    // Approving needs a fresh review after any failure (prices or stock may have moved). Rejecting only
    // waits when the request changed elsewhere; the backend still checks the version it was shown at.
    if (
      lock.current ||
      refreshing ||
      readFailed ||
      (kind === 'approve' &&
        (mustReview || !canApprove || (sessionId && !confirmedGroup) || allLeftOut || reasonMissing)) ||
      (kind === 'reject' && (remotelyChanged || !canReject))
    )
      return
    if (kind === 'reject') {
      const validated = qrReviewRejectSchema.safeParse({
        expectedRequestVersion: request.version,
        reason: rejectReason,
      })
      if (!validated.success) {
        setError(validated.error)
        return
      }
    }
    lock.current = true
    setError(null)
    try {
      const result = await mutation.mutateAsync(
        kind === 'approve'
          ? { kind, detail, excludedItems: editable ? excludedItemsOf(quoteLines, selection) : undefined }
          : { kind, detail, reason: rejectReason },
      )
      if (!sameOrderScope(scope, useAuthStore.getState())) return
      if ('order' in result) onDone(`Đã xác nhận yêu cầu QR vào đơn ${result.order.orderCode}.`, result.approvedOrderId)
      else onDone('Đã từ chối yêu cầu gọi món QR.')
    } catch (failure) {
      if (!sameOrderScope(scope, useAuthStore.getState())) return
      setError(failure)
      setNeedsReview(true)
      setConfirmedGroup(false)
      // Short of stock: leave those dishes out so staff can re-read and approve the rest.
      const short = stockShortageOf(failure)
      if (short) {
        const menuItemIds = short.flatMap((dish) => (dish.menuItemId ? [dish.menuItemId] : []))
        setSelection((current) => untickMenuItems(current, quoteLines, menuItemIds))
      }
      if (orderError(failure).code === 'QR_APPROVAL_EMPTY') setRejectOpen(true)
    } finally {
      lock.current = false
    }
  }
  const refusalMessage =
    detail.reasonCode === 'FORBIDDEN'
      ? 'Bạn chưa có đủ quyền xử lý yêu cầu này. Duyệt QR cần ORDER_CREATE và ORDER_UPDATE; mở bàn mới cần TABLE_OPEN.'
      : isAllLinesUnavailable(detail.reasonCode)
        ? 'Tất cả món trong yêu cầu đều đã hết hoặc ngừng bán, chỉ có thể từ chối.'
        : detail.reasonCode
          ? orderError(new Error(detail.reasonCode)).message
          : ''
  const repriced = (editable ? acceptedLines(quoteLines, selection) : quoteLines).some(
    (line) => line.available && priceChanged(line, request.items),
  )
  const shortage = error ? stockShortageOf(error) : null
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
      {request.status === 'PENDING' && detail.currentQuote ? (
        <QrReviewQuoteLines
          lines={quoteLines}
          items={request.items}
          selection={selection}
          onChange={setSelection}
          editable={editable}
          hideReasons={allLeftOut}
          disabled={busy || refreshing}
          currencyCode={request.currencyCode}
        />
      ) : (
        <QrReviewRequestItems items={request.items} currencyCode={request.currencyCode} />
      )}
      <div className="qr-review-amount">
        <span>Khách dự kiến</span>
        <strong>{formatMinor(moneyMinor(request.estimatedAmount), request.currencyCode)}</strong>
      </div>
      {request.status === 'PENDING' && detail.currentQuote && (
        <div className="qr-review-amount">
          <span>
            {allLeftOut
              ? 'Không nhận món nào'
              : editable
                ? `Tạm tính các món được nhận (${accepted}/${quoteLines.length} món)`
                : 'Giá hiện tại các món còn bán'}
          </span>
          <strong>
            {allLeftOut
              ? '—'
              : formatMinor(
                  editable ? acceptedTotal(quoteLines, selection) : moneyMinor(detail.currentQuote.amount),
                  detail.currentQuote.currencyCode,
                )}
          </strong>
        </div>
      )}
      {request.status === 'PENDING' && repriced && (
        <p className="qr-review-warning">
          Giá đã thay đổi so với lúc khách gửi. Kiểm tra với khách trước khi xác nhận.
        </p>
      )}
      {request.entryType === 'TABLE' && detail.canApprove && !allLeftOut && (
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
      {request.entryType === 'RESTAURANT' && detail.canApprove && !allLeftOut && (
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
      {request.cancellationReason && <p>Lý do hủy: {qrCancellationLabel(request.cancellationReason)}</p>}
      {/* One notice: the specific error if there is one, otherwise why a re-check is needed. */}
      {shortage ? (
        <QrStockShortage dishes={shortage} allLeftOut={allLeftOut} />
      ) : error ? (
        <OrderFeedback error={error} />
      ) : mustReview ? (
        <p className="qr-review-warning" role="status">
          Yêu cầu vừa thay đổi. Kiểm tra lại trước khi quyết định; hệ thống không tự gửi lại thao tác.
        </p>
      ) : null}
      {request.status === 'PENDING' ? (
        <div className="qr-review-decision">
          {rejectShown && canReject ? (
            <section className="qr-review-reject" aria-label="Từ chối yêu cầu">
              <h4>Từ chối yêu cầu</h4>
              <label>
                Lý do gửi khách
                <textarea
                  aria-describedby="qr-review-reject-hint"
                  value={rejectReason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  disabled={busy}
                  rows={2}
                  placeholder="VD: Bếp đã đóng, xin lỗi bạn"
                />
              </label>
              <p id="qr-review-reject-hint" className="order-muted qr-review-reject-hint">
                Khách sẽ thấy lý do này.
              </p>
              <button
                type="button"
                className="button button-danger-solid qr-review-main-action"
                disabled={busy || refreshing || remotelyChanged || !rejectReason.trim()}
                onClick={() => void decide('reject')}
              >
                {busy ? 'Đang xử lý...' : 'Từ chối và báo khách'}
              </button>
              <div className="qr-review-secondary-actions">
                {!onlyReject && (
                  <button type="button" className="qr-review-link" disabled={busy} onClick={() => setRejectOpen(false)}>
                    Quay lại xác nhận
                  </button>
                )}
                <button
                  type="button"
                  className="qr-review-link"
                  disabled={busy || refreshing}
                  onClick={() => void reviewAgain()}
                >
                  {refreshing ? 'Đang kiểm tra...' : 'Kiểm tra lại yêu cầu'}
                </button>
              </div>
            </section>
          ) : (
            <>
              {mustReview ? (
                <button
                  type="button"
                  className="button button-primary qr-review-main-action"
                  disabled={busy || refreshing}
                  onClick={() => void reviewAgain()}
                >
                  {refreshing ? 'Đang kiểm tra...' : 'Kiểm tra lại yêu cầu'}
                </button>
              ) : (
                <button
                  type="button"
                  className="button button-primary qr-review-main-action"
                  disabled={busy || refreshing || !canApprove || reasonMissing || (!!sessionId && !confirmedGroup)}
                  onClick={() => void decide('approve')}
                >
                  {busy
                    ? 'Đang xử lý...'
                    : editable && accepted < quoteLines.length
                      ? `Xác nhận ${accepted}/${quoteLines.length} món`
                      : 'Xác nhận yêu cầu'}
                </button>
              )}
              {!canApprove && !detail.reasonCode && (
                <p className="order-muted">Bạn chưa có đủ quyền xác nhận yêu cầu này.</p>
              )}
              <div className="qr-review-secondary-actions">
                {canReject && (
                  <button
                    type="button"
                    className="qr-review-link qr-review-link-danger"
                    disabled={busy}
                    onClick={() => setRejectOpen(true)}
                  >
                    Từ chối cả yêu cầu
                  </button>
                )}
                {!mustReview && (
                  <button
                    type="button"
                    className="qr-review-link"
                    disabled={busy || refreshing}
                    onClick={() => void reviewAgain()}
                  >
                    {refreshing ? 'Đang kiểm tra...' : 'Kiểm tra lại yêu cầu'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="button button-ghost"
          disabled={busy || refreshing}
          onClick={() => void reviewAgain()}
        >
          {refreshing ? 'Đang kiểm tra...' : 'Kiểm tra lại yêu cầu'}
        </button>
      )}
    </>
  )
}
