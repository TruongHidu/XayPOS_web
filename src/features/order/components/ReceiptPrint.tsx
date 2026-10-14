import type { Order } from '../types'
import type { Payment } from '../../payment/schemas'
import { formatMinor, moneyMinor } from '../../../shared/utils/scaledDecimal'
import { useAuthStore } from '../../auth/store/authStore'
import { isLineAppended } from '../utils/orderAppended'

export function ReceiptPrint({
  order,
  payment,
  cashGiven,
  change,
}: {
  order: Order
  payment?: Payment | null
  cashGiven?: bigint
  change?: bigint
}) {
  const user = useAuthStore((state) => state.user)
  const currency = order.currencyCode || 'VND'

  return (
    <div className="pos-receipt-print">
      <div className="pos-receipt-header">
        <h2>{user?.restaurantName || 'NHÀ HÀNG POS SAAS'}</h2>
        <p className="pos-receipt-subtitle">{user?.restaurantCode || 'HÓA ĐƠN THANH TOÁN'}</p>
        <p className="pos-receipt-info">Mã đơn: <strong>{order.orderCode}</strong></p>
        <p className="pos-receipt-info">
          Thời gian: {new Date(order.createdAt).toLocaleString('vi-VN')}
        </p>
        <p className="pos-receipt-info">
          Loại đơn: {order.serviceType === 'TAKEAWAY' ? 'Mang đi' : 'Tại bàn'}
        </p>
        {order.customerName && (
          <p className="pos-receipt-info">Khách hàng: {order.customerName}</p>
        )}
      </div>

      <div className="pos-receipt-divider" />

      <table className="pos-receipt-table">
        <thead>
          <tr>
            <th className="text-left">Món</th>
            <th className="text-center">SL</th>
            <th className="text-right">Đơn giá</th>
            <th className="text-right">T.Tiền</th>
          </tr>
        </thead>
        <tbody>
          {order.items
            .filter((line) => line.status !== 'CANCELLED')
            .map((line) => (
              <tr key={line.id}>
                <td className="text-left">
                  <div>
                    {line.itemName}
                    {isLineAppended(order, line) && (
                      <span className="pos-receipt-append-tag" style={{ fontSize: '11px', color: '#666', fontStyle: 'italic', marginLeft: '4px' }}>
                        (+gọi thêm)
                      </span>
                    )}
                  </div>
                  {line.note && <small className="text-muted">({line.note})</small>}
                </td>
                <td className="text-center">{line.quantity}</td>
                <td className="text-right">{formatMinor(moneyMinor(line.unitPrice), currency)}</td>
                <td className="text-right">{formatMinor(moneyMinor(line.lineTotal), currency)}</td>
              </tr>
            ))}
        </tbody>
      </table>

      <div className="pos-receipt-divider" />

      <div className="pos-receipt-totals">
        <div className="pos-receipt-row">
          <span>Tiền hàng:</span>
          <span>{formatMinor(moneyMinor(order.subtotalAmount), currency)}</span>
        </div>
        {moneyMinor(order.discountAmount) > 0n && (
          <div className="pos-receipt-row">
            <span>Giảm giá:</span>
            <span>-{formatMinor(moneyMinor(order.discountAmount), currency)}</span>
          </div>
        )}
        {moneyMinor(order.taxAmount) > 0n && (
          <div className="pos-receipt-row">
            <span>Thuế:</span>
            <span>{formatMinor(moneyMinor(order.taxAmount), currency)}</span>
          </div>
        )}
        {moneyMinor(order.serviceChargeAmount) > 0n && (
          <div className="pos-receipt-row">
            <span>Phí phục vụ:</span>
            <span>{formatMinor(moneyMinor(order.serviceChargeAmount), currency)}</span>
          </div>
        )}
        <div className="pos-receipt-row pos-receipt-grand-total">
          <strong>TỔNG TIỀN:</strong>
          <strong>{formatMinor(moneyMinor(order.totalAmount), currency)}</strong>
        </div>

        {payment && (
          <>
            <div className="pos-receipt-divider" />
            <div className="pos-receipt-row">
              <span>Phương thức:</span>
              <span>{payment.paymentMethod === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}</span>
            </div>
            {payment.referenceNo && (
              <div className="pos-receipt-row">
                <span>Mã giao dịch:</span>
                <span>{payment.referenceNo}</span>
              </div>
            )}
            {cashGiven && cashGiven > 0n && (
              <div className="pos-receipt-row">
                <span>Khách đưa:</span>
                <span>{formatMinor(cashGiven, currency)}</span>
              </div>
            )}
            {change !== undefined && change > 0n && (
              <div className="pos-receipt-row">
                <span>Tiền thừa:</span>
                <span>{formatMinor(change, currency)}</span>
              </div>
            )}
            <div className="pos-receipt-row">
              <span>Trạng thái:</span>
              <strong>ĐÃ THANH TOÁN</strong>
            </div>
          </>
        )}
      </div>

      <div className="pos-receipt-footer">
        <p>Cảm ơn Quý khách và hẹn gặp lại!</p>
        <small>Hệ thống POS SaaS</small>
      </div>
    </div>
  )
}
