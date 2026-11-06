import type { QrReviewCriteria } from '../types'
export const qrReviewKeys = {
  root: (scope: string | null) => ['cashier', scope, 'qr-review'] as const,
  lists: (scope: string | null) => [...qrReviewKeys.root(scope), 'queue'] as const,
  list: (scope: string | null, criteria: QrReviewCriteria) => [...qrReviewKeys.lists(scope), criteria] as const,
  detail: (scope: string | null, id: string) => [...qrReviewKeys.root(scope), 'detail', id] as const,
  table: (scope: string | null, id: string | null) => ['cashier', scope, 'tables', 'qr-label', id] as const,
}
