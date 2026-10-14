import { Link, useParams } from 'react-router-dom'
import { useOrderDetail } from '../hooks/useOrderDetail'
import { OrderFeedback } from '../components/OrderUi'
import { OrderPanel } from '../components/OrderPanel'
import { resourceId } from '../../../shared/api/tenantSchemas'
import '../order.css'
export function OrderDetailPage() {
  const { orderId = '' } = useParams()
  const valid = resourceId.safeParse(orderId).success
  return (
    <div className="cashier-order">
      <Link to="/cashier/orders">← Danh sách đơn</Link>
      {valid ? <OrderDetailBody id={orderId} /> : <p role="alert">Mã đơn không hợp lệ.</p>}
    </div>
  )
}
function OrderDetailBody({ id }: { id: string }) {
  const q = useOrderDetail(id)
  return (
    <>
      {q.isFetching && <p role="status">Đang tải đơn...</p>}
      <OrderFeedback error={q.error} onRetry={() => void q.refetch()} />
      {q.data && <OrderPanel key={q.data.id} order={q.data} />}
    </>
  )
}
