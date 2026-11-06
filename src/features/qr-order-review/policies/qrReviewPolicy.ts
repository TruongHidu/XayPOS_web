import { canOrder, hasPermission, type OrderAccess } from '../../order/policies/orderAccessPolicy'
import type { QrReviewDetail, QrReviewSummary } from '../types'
export const qrRequestPending = (request: QrReviewSummary, now = Date.now()) =>
  request.status === 'PENDING' && !request.expired && Date.parse(request.expiresAt) > now
export function canApproveQr(access: OrderAccess, detail: QrReviewDetail, now = Date.now()) {
  return (
    canOrder(access, 'ORDER_VIEW') &&
    canOrder(access, 'ORDER_CREATE') &&
    canOrder(access, 'ORDER_UPDATE') &&
    detail.canApprove &&
    qrRequestPending(detail.request, now) &&
    !!detail.currentQuote &&
    !!detail.reviewContextHash &&
    (detail.request.entryType !== 'TABLE' ||
      (!!detail.reviewContext && (!!detail.reviewContext.currentSessionId || hasPermission(access, 'TABLE_OPEN'))))
  )
}
export const canRejectQr = (access: OrderAccess, request: QrReviewSummary) =>
  canOrder(access, 'ORDER_VIEW') && canOrder(access, 'ORDER_UPDATE') && request.status === 'PENDING'
export const qrReviewStatusLabels = {
  PENDING: 'Chờ xác nhận',
  APPROVED: 'Đã xác nhận',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
}
