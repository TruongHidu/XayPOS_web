import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../auth/store/authStore'
import { useOrderAccess } from '../../order/hooks/useOrderAccess'
import { canOrder, sameOrderScope } from '../../order/policies/orderAccessPolicy'
import { orderKeys } from '../../order/api/orderKeys'
import { cashierTablesApi } from '../../tables/api/cashierTablesApi'
import { canTables } from '../../order/policies/orderAccessPolicy'
import { qrReviewApi } from '../api/qrReviewApi'
import { qrReviewKeys } from '../api/qrReviewKeys'
import { canApproveQr, canRejectQr } from '../policies/qrReviewPolicy'
import type { QrReviewCriteria, QrReviewDetail } from '../types'

export function useQrReviewQueue(criteria: QrReviewCriteria, enabled = true) {
  const { access, scope } = useOrderAccess()
  return useQuery({
    queryKey: qrReviewKeys.list(scope, criteria),
    queryFn: ({ signal }) => qrReviewApi.list(scope!, criteria, signal),
    enabled: enabled && !!scope && canOrder(access, 'ORDER_VIEW'),
    retry: false,
    refetchInterval: (query) => (query.state.error ? false : 10000),
    refetchIntervalInBackground: false,
  })
}
export function useQrReviewDetail(id: string) {
  const { access, scope } = useOrderAccess()
  return useQuery({
    queryKey: qrReviewKeys.detail(scope, id),
    queryFn: ({ signal }) => qrReviewApi.detail(scope!, id, signal),
    enabled: !!scope && canOrder(access, 'ORDER_VIEW'),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}
export function useQrReviewTable(id: string | null) {
  const { access, scope } = useOrderAccess()
  return useQuery({
    queryKey: qrReviewKeys.table(scope, id),
    queryFn: ({ signal }) => cashierTablesApi.table(scope!, id!, signal),
    enabled: !!scope && !!id && canTables(access),
    staleTime: 30000,
    retry: false,
  })
}
type Decision = { detail: QrReviewDetail } & ({ kind: 'approve' } | { kind: 'reject'; reason: string })
export function useQrReviewDecision() {
  const { scope } = useOrderAccess()
  const client = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (decision: Decision) => {
      const access = useAuthStore.getState()
      if (!scope || !sameOrderScope(scope, access)) throw new Error('ORDER_ACCESS_CHANGED')
      const { detail } = decision
      if (decision.kind === 'approve') {
        if (!canApproveQr(access, detail)) throw new Error('QR_REVIEW_REQUIRED')
        return qrReviewApi.approve(scope, detail.request.requestId, {
          expectedRequestVersion: detail.request.version,
          expectedReviewContextHash: detail.reviewContextHash!,
          targetSessionId: detail.request.entryType === 'TABLE' ? detail.reviewContext!.currentSessionId : null,
        })
      }
      if (!canRejectQr(access, detail.request)) throw new Error('QR_REVIEW_REQUIRED')
      return qrReviewApi.reject(scope, detail.request.requestId, {
        expectedRequestVersion: detail.request.version,
        reason: decision.reason,
      })
    },
    onSuccess: (result) => {
      if (!sameOrderScope(scope, useAuthStore.getState())) return
      void client.invalidateQueries({ queryKey: qrReviewKeys.root(scope) })
      if ('order' in result) {
        client.setQueryData(orderKeys.detail(scope, result.order.id), result.order)
        void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
        void client.invalidateQueries({ queryKey: orderKeys.tables(scope) })
        void client.invalidateQueries({ queryKey: orderKeys.sessions(scope) })
        void client.invalidateQueries({ queryKey: orderKeys.activeOrders(scope) })
      }
    },
  })
}
