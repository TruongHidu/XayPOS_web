import { useQrReviewQueue } from '../../features/qr-order-review/hooks/useQrReview'
import { qrReviewCriteriaSchema } from '../../features/qr-order-review/schemas'
import { canOrder } from '../../features/order/policies/orderAccessPolicy'
import { useTenantAccess } from '../../shared/access/useTenantAccess'

// Same criteria as the default Đơn hàng board, so the badge shares its cache entry.
const pendingQrCriteria = qrReviewCriteriaSchema.parse({ page: 0 })

/** QR requests waiting for staff, shown on "Đơn hàng" (the inbox lives on that board). */
export function useQrPendingBadge() {
  const { access } = useTenantAccess()
  const canHandle = canOrder(access, 'ORDER_VIEW') && canOrder(access, 'ORDER_UPDATE')
  const query = useQrReviewQueue(pendingQrCriteria, canHandle)
  return canHandle ? query.data?.totalElements : undefined
}
