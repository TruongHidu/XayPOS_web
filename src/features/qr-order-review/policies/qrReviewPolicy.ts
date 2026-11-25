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
/** Why the system cancelled a pending QR request (backend `cancellationReason`). */
export const qrCancellationLabels: Record<string, string> = {
  QR_ORDERING_DISABLED: 'Hủy do nhà hàng tắt QR gọi món',
  RESTAURANT_MENU_TOKEN_ROTATED: 'Hủy do đổi link QR menu mang đi',
  CHECKOUT_STARTED: 'Hủy do bàn bắt đầu thanh toán',
  TABLE_DISABLED: 'Hủy do bàn ngừng sử dụng',
  TABLE_DELETED: 'Hủy do bàn bị xóa',
  TABLE_QR_ROTATED: 'Hủy do đổi mã QR của bàn',
  SESSION_CLOSED: 'Hủy do phiên bàn đã đóng',
  SESSION_CANCELLED: 'Hủy do phiên bàn bị hủy',
  SESSION_TRANSFERRED: 'Hủy do khách chuyển bàn',
}
export const qrCancellationLabel = (code: string) => qrCancellationLabels[code] ?? `Lý do khác (${code})`
/** Why a quote line can no longer be served (backend `unavailableReason`), for staff. */
export const qrUnavailableLabels: Record<string, string> = {
  ITEM_OUT_OF_STOCK: 'Hết hàng',
  ITEM_NOT_SELLABLE: 'Ngừng bán',
  MENU_ITEM_NOT_FOUND: 'Không còn trong thực đơn',
}
export const qrUnavailableLabel = (code: string | null) =>
  (code && qrUnavailableLabels[code]) ?? `Không còn bán${code ? ` (${code})` : ''}`
/** `reasonCode` when every line is unavailable: only rejecting is left. */
export const isAllLinesUnavailable = (reasonCode: string | null) => !!reasonCode && reasonCode in qrUnavailableLabels
