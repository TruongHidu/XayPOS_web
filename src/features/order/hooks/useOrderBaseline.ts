import { useState } from 'react'
import type { Order } from '../types'
import { orderKeys } from '../api/orderKeys'
import { useOrderAccess } from './useOrderAccess'
import { useOrderDetail } from './useOrderDetail'
import { useRemoteRevision } from '../../../shared/realtime/useRemoteRevision'

/** Input/intent survives refetch. Adopting a new command baseline requires an explicit review. */
export function useOrderBaseline(initial: Order) {
  const { scope } = useOrderAccess()
  const query = useOrderDetail(initial.id, initial)
  const revision = useRemoteRevision(orderKeys.detail(scope, initial.id))
  const [reviewed, setReviewed] = useState(() => ({ order: initial, revision }))
  const needsReview =
    revision !== reviewed.revision ||
    (query.data?.version ?? 0) > reviewed.order.version ||
    initial.version > reviewed.order.version
  const review = async () => {
    const captured = revision
    const result = await query.refetch()
    if (result.isError || !result.data) return
    setReviewed({ order: result.data, revision: captured })
  }
  return { order: reviewed.order, needsReview, refreshing: query.isFetching, readFailed: query.isError, review }
}
