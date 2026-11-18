import { Navigate, useLocation, useParams } from 'react-router-dom'

/**
 * Old `/app/takeaway[/:orderId]` links: Đơn mang đi is now the `Mang đi` filter
 * of Đơn hàng, so the list opens filtered and an order opens its detail page.
 */
export function LegacyTakeawayRedirect() {
  const { orderId } = useParams()
  const location = useLocation()
  if (orderId) return <Navigate to={`/app/orders/${encodeURIComponent(orderId)}${location.search}`} replace />
  const query = new URLSearchParams(location.search)
  query.set('serviceType', 'TAKEAWAY')
  return <Navigate to={`/app/orders?${query.toString()}`} replace />
}
