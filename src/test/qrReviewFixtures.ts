import { qrReviewDetailSchema, qrReviewSummarySchema } from '../features/qr-order-review/schemas'
import type { QrReviewDetail, QrReviewSummary } from '../features/qr-order-review/types'
import { ids, makeOrder } from './orderFixtures'
export const reviewId = '88888888-8888-4888-8888-888888888888'
export const reviewHash = 'a'.repeat(64)
export function reviewSummary(patch: Partial<QrReviewSummary> = {}) {
  return qrReviewSummarySchema.parse({
    requestId: reviewId,
    entryType: 'TABLE',
    serviceType: 'DINE_IN',
    sourceChannel: 'QR_TABLE',
    status: 'PENDING',
    version: 2,
    expired: false,
    tableId: ids.table,
    observedSessionId: null,
    customerName: 'Khách QR',
    customerPhone: '0900000000',
    note: 'Ít cay',
    currencyCode: 'VND',
    estimatedAmount: 100000,
    approvedAmount: null,
    approvedOrderId: null,
    approvedSessionId: null,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 900000).toISOString(),
    items: [
      {
        id: ids.line,
        itemId: ids.item,
        itemName: 'Phở khách gọi QR',
        unit: 'tô',
        quantity: 2,
        unitPrice: 50000,
        lineTotal: 100000,
        note: 'Không hành',
        approvedOrderItemId: null,
      },
    ],
    ...patch,
  })
}
export function reviewDetail(patch: Partial<QrReviewDetail> = {}): QrReviewDetail {
  const request = patch.request ?? reviewSummary()
  return qrReviewDetailSchema.parse({
    request,
    currentQuote: { currencyCode: 'VND', amount: 100000, lines: request.items },
    reviewContextHash: reviewHash,
    canApprove: true,
    reasonCode: null,
    reviewContext: {
      currentSessionId: null,
      tableAccessEpoch: 0,
      sessionVersion: null,
      guestCount: null,
      currentOrder: null,
    },
    ...patch,
  })
}
export function reviewApproval(takeaway = false) {
  return {
    requestId: reviewId,
    status: 'APPROVED',
    version: 3,
    approvedOrderId: ids.order,
    approvedSessionId: takeaway ? null : ids.session,
    approvedBy: ids.user,
    approvedAt: new Date().toISOString(),
    approvedAmount: 100000,
    approvedOrderItemIds: [ids.line],
    replay: false,
    order: makeOrder({
      serviceType: takeaway ? 'TAKEAWAY' : 'DINE_IN',
      sourceChannel: takeaway ? 'QR_STATIC' : 'QR_TABLE',
      tableSessionId: takeaway ? null : ids.session,
      status: 'CONFIRMED',
      orderCode: 'OD-QR-001',
    }),
  }
}
