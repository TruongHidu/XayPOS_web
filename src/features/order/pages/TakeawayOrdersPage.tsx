import { OrderListPage } from './OrderListPage'

/** Đơn mang đi (app section `takeaway-orders`): the order board fixed to takeaway. */
export function TakeawayOrdersPage() {
  return <OrderListPage fixedServiceType="TAKEAWAY" />
}
