import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { canOrder } from '../../order/policies/orderAccessPolicy'
import { qrReviewCriteriaSchema } from '../schemas'
import { useQrReviewQueue } from './useQrReview'

// Same criteria as the default Đơn hàng board, so the count shares its cache entry.
const pendingQrCriteria = qrReviewCriteriaSchema.parse({ page: 0 })

/** QR requests waiting for staff; undefined when the user cannot handle them. */
export function useQrPendingCount() {
  const { access } = useTenantAccess()
  const canHandle = canOrder(access, 'ORDER_VIEW') && canOrder(access, 'ORDER_UPDATE')
  const query = useQrReviewQueue(pendingQrCriteria, canHandle)
  return canHandle ? query.data?.totalElements : undefined
}
