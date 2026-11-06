import { formatMinor, moneyMinor } from '../../../shared/utils/scaledDecimal'
import type { ReceiptDocument } from '../printing/receiptModel'
import '../printing/receipt.css'

const formatTime = (value: string) => new Date(value).toLocaleString('vi-VN')
const formatQuantity = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 3 })

/** Shared screen preview and physical-print template; all data is prepared before rendering. */
export function ReceiptPrint({ receipt }: { receipt: ReceiptDocument }) {
  const { order, payment, restaurant, tender } = receipt
  const amount = (value: number) => formatMinor(moneyMinor(value))
  return (
    <article className="receipt-document" aria-label={receipt.kind === 'paid' ? 'Bill đã thanh toán' : 'Bill tạm tính'}>
      <header className="receipt-document__header">
        <h2>{restaurant.name}</h2>
        {restaurant.code && <p>{restaurant.code}</p>}
        <h3>{receipt.kind === 'paid' ? 'BILL ĐÃ THANH TOÁN' : 'BILL TẠM TÍNH'}</h3>
        {receipt.reprint && <strong className="receipt-document__reprint">BẢN IN LẠI</strong>}
        {receipt.kind === 'provisional' && <p>Chưa xác nhận thanh toán</p>}
      </header>
      <section className="receipt-document__meta" aria-label="Thông tin bill">
        <p>
          Mã đơn: <strong>{order.orderCode}</strong>
        </p>
        <p>Tạo đơn: {formatTime(order.createdAt)}</p>
        <p>
          {receipt.reprint ? 'In lại lúc' : 'In lúc'}: {formatTime(receipt.printedAt)}
        </p>
        <p>Phục vụ: {order.serviceType === 'TAKEAWAY' ? 'Mang đi' : 'Tại bàn'}</p>
        {order.customerName && <p>Khách: {order.customerName}</p>}
        {order.note && <p>Ghi chú: {order.note}</p>}
      </section>
      <div className="receipt-document__divider" />
      <table className="receipt-document__items">
        <colgroup>
          <col style={{ width: '30%' }} />
          <col style={{ width: '35%' }} />
          <col style={{ width: '35%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="receipt-document__quantity">SL / ĐV</th>
            <th className="receipt-document__price">Đơn giá</th>
            <th className="receipt-document__amount">Thành tiền</th>
          </tr>
        </thead>
        {order.items.map((line) => (
          <tbody key={line.id} data-order-item-id={line.id}>
            <tr>
              <td colSpan={3} className="receipt-document__name">
                <strong>{line.itemName}</strong>
                {line.note && <small className="receipt-document__line-note">{line.note}</small>}
              </td>
            </tr>
            <tr>
              <td className="receipt-document__quantity">
                <span className="receipt-document__quantity-value">{formatQuantity(line.quantity)}</span>
                <span className="receipt-document__unit">{line.unit}</span>
              </td>
              <td className="receipt-document__price">
                <span
                  className={`receipt-document__money ${amount(line.unitPrice).length > 13 ? 'receipt-document__money--compact' : ''}`}
                >
                  {amount(line.unitPrice)}
                </span>
              </td>
              <td className="receipt-document__amount">
                <span
                  className={`receipt-document__money ${amount(line.lineTotal).length > 13 ? 'receipt-document__money--compact' : ''}`}
                >
                  {amount(line.lineTotal)}
                </span>
              </td>
            </tr>
          </tbody>
        ))}
      </table>
      <section className="receipt-document__totals" aria-label="Tổng tiền">
        <div className="receipt-document__row">
          <span>Tiền hàng</span>
          <span className="receipt-document__money">{amount(order.subtotalAmount)}</span>
        </div>
        {moneyMinor(order.discountAmount) > 0n && (
          <div className="receipt-document__row">
            <span>Giảm giá</span>
            <span className="receipt-document__money">−{amount(order.discountAmount)}</span>
          </div>
        )}
        {moneyMinor(order.taxAmount) > 0n && (
          <div className="receipt-document__row">
            <span>Thuế</span>
            <span className="receipt-document__money">{amount(order.taxAmount)}</span>
          </div>
        )}
        {moneyMinor(order.serviceChargeAmount) > 0n && (
          <div className="receipt-document__row">
            <span>Phí phục vụ</span>
            <span className="receipt-document__money">{amount(order.serviceChargeAmount)}</span>
          </div>
        )}
        <div className="receipt-document__row receipt-document__grand-total">
          <strong>TỔNG TIỀN</strong>
          <strong className="receipt-document__money">{amount(order.totalAmount)}</strong>
        </div>
        <div className="receipt-document__row">
          <span>Đơn vị tiền</span>
          <span>{order.currencyCode}</span>
        </div>
        {receipt.kind === 'paid' && (
          <div className="receipt-document__row">
            <span>Đã thanh toán</span>
            <span className="receipt-document__money">{amount(order.paidAmount)}</span>
          </div>
        )}
        {receipt.kind === 'provisional' && (
          <div className="receipt-document__row">
            <span>Còn phải trả</span>
            <span className="receipt-document__money">
              {formatMinor(moneyMinor(order.totalAmount) - moneyMinor(order.paidAmount))}
            </span>
          </div>
        )}
      </section>
      {payment && (
        <section className="receipt-document__payment receipt-document__meta" aria-label="Giao dịch thanh toán">
          <div className="receipt-document__divider" />
          <p>Mã thanh toán: {payment.paymentCode}</p>
          <p>Phương thức: {payment.paymentMethod === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}</p>
          {payment.paidAt && <p>Thanh toán lúc: {formatTime(payment.paidAt)}</p>}
          {payment.referenceNo && <p>Mã tham chiếu: {payment.referenceNo}</p>}
          {tender && (
            <>
              <div className="receipt-document__row">
                <span>Khách đưa</span>
                <span className="receipt-document__money">{formatMinor(tender.cashGiven)}</span>
              </div>
              <div className="receipt-document__row">
                <span>Tiền thừa</span>
                <span className="receipt-document__money">{formatMinor(tender.change)}</span>
              </div>
            </>
          )}
        </section>
      )}
      <footer className="receipt-document__footer">
        <p>Cảm ơn Quý khách và hẹn gặp lại!</p>
      </footer>
    </article>
  )
}
