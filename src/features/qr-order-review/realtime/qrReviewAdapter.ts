import type { QueryClient } from '@tanstack/react-query'
import type { OrderEvent, QrEvent } from '../../../shared/realtime/events'
import type { QueryInvalidator } from '../../../shared/realtime/queryInvalidator'
import { qrReviewKeys } from '../api/qrReviewKeys'
import type { QrReviewDetail } from '../types'

export function invalidateQrEvent(invalidator: QueryInvalidator, scope: string, event: QrEvent) {
  invalidator.invalidate(qrReviewKeys.lists(scope))
  invalidator.invalidate(qrReviewKeys.detail(scope, event.resourceId), true)
  if (event.payload.tableId) invalidator.invalidate(qrReviewKeys.table(scope, event.payload.tableId), true)
}
export function invalidateReviewContext(
  invalidator: QueryInvalidator,
  client: QueryClient,
  scope: string,
  event: OrderEvent,
) {
  for (const query of client.getQueryCache().findAll({ queryKey: qrReviewKeys.root(scope) })) {
    if (query.queryKey[3] !== 'detail') continue
    const detail = query.state.data as QrReviewDetail | undefined
    if (!detail) continue
    if (
      detail.reviewContext?.currentOrder?.id === event.resourceId ||
      (event.payload.tableSessionId &&
        (detail.reviewContext?.currentSessionId === event.payload.tableSessionId ||
          detail.request.observedSessionId === event.payload.tableSessionId)) ||
      // A pending TABLE review with no session can gain a session after approval elsewhere.
      (!detail.reviewContext?.currentSessionId &&
        detail.request.entryType === 'TABLE' &&
        detail.request.status === 'PENDING')
    )
      invalidator.invalidate(query.queryKey, true)
  }
}
