import { formatMinor, moneyMinor } from '../../../shared/utils/scaledDecimal'
import type { QrReceipt } from '../types'
import { receiptLabel } from '../policies/qrOrderPolicy'
const lineLabels = {
  PENDING: 'Chờ chế biến',
  COOKING: 'Đang chế biến',
  READY: 'Món sẵn sàng',
  SERVED: 'Đã giao món',
  CANCELLED: 'Món đã hủy',
}
export function QrOrderReceipt({ receipt }: { receipt: QrReceipt }) {
  const approved = receipt.status === 'APPROVED'
  return (
    <article className="qr-order-receipt">
      <header className={'qr-order-receipt-status is-' + receipt.status.toLowerCase()}>
        <span className="qr-order-status-icon" aria-hidden="true">
          {approved ? '✓' : receipt.status === 'PENDING' && !receipt.expired ? '◷' : '!'}
        </span>
        <span className="qr-order-eyebrow">YÊU CẦU GỌI MÓN</span>
        <h1>{receiptLabel(receipt)}</h1>
        <p>
          {approved
            ? 'Các món dưới đây đã được nhà hàng nhận vào đơn.'
            : receipt.status === 'PENDING' && !receipt.expired
              ? 'Nhân viên sẽ kiểm tra và xác nhận món bạn chọn.'
              : 'Vui lòng liên hệ nhân viên nếu cần hỗ trợ.'}
        </p>
      </header>
      <div className="qr-order-receipt-meta">
        <span>{receipt.serviceType === 'TAKEAWAY' ? 'Mang đi · Nhận tại quầy' : 'Tại bàn'}</span>
        <time dateTime={receipt.createdAt}>{new Date(receipt.createdAt).toLocaleString('vi-VN')}</time>
      </div>
      {receipt.approvedOrderCode && (
        <p className="qr-order-order-code">
          Mã đơn: <strong>{receipt.approvedOrderCode}</strong>
        </p>
      )}
      {receipt.status === 'PENDING' && !receipt.expired && (
        <p className="qr-order-notice">
          Nhà hàng cần xác nhận trước{' '}
          {new Date(receipt.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}. Yêu cầu
          hiện chưa được tính vào đơn.
        </p>
      )}
      <div className="qr-order-receipt-lines">
        {receipt.items.map((item) => (
          <article className="qr-order-receipt-line" key={item.requestItemId}>
            <div>
              <strong>{item.itemName}</strong>
              <span className={'qr-order-item-status is-' + (item.status?.toLowerCase() ?? 'waiting')}>
                {item.status ? lineLabels[item.status] : approved ? 'Đang cập nhật món' : 'Chờ xác nhận'}
              </span>
            </div>
            <p>
              {item.quantity} {item.unit} ×{' '}
              {formatMinor(
                moneyMinor(
                  approved && item.approvedUnitPrice !== null ? item.approvedUnitPrice : item.estimatedUnitPrice,
                ),
                receipt.currencyCode,
              )}
              {approved && item.approvedUnitPrice === null ? ' (giá dự kiến)' : ''}
            </p>
            {item.note && <p className="qr-order-muted">Ghi chú: {item.note}</p>}
            <strong>
              {approved
                ? item.approvedLineTotal === null
                  ? 'Chưa có giá chốt'
                  : formatMinor(moneyMinor(item.approvedLineTotal), receipt.currencyCode)
                : formatMinor(moneyMinor(item.estimatedLineTotal), receipt.currencyCode)}
            </strong>
          </article>
        ))}
      </div>
      <dl className="qr-order-receipt-totals">
        <div>
          <dt>Tổng dự kiến lúc gửi</dt>
          <dd>{formatMinor(moneyMinor(receipt.estimatedAmount), receipt.currencyCode)}</dd>
        </div>
        {approved && (
          <div className="qr-order-approved-total">
            <dt>Giá chốt cho yêu cầu này</dt>
            <dd>
              {receipt.approvedAmount === null
                ? 'Đang cập nhật'
                : formatMinor(moneyMinor(receipt.approvedAmount), receipt.currencyCode)}
            </dd>
          </div>
        )}
      </dl>
      {approved && receipt.approvedAmount !== null && receipt.approvedAmount !== receipt.estimatedAmount && (
        <p className="qr-order-notice">
          Giá được nhà hàng xác nhận khác giá dự kiến lúc gửi. Vui lòng hỏi nhân viên nếu cần làm rõ.
        </p>
      )}
      <p className="qr-order-muted qr-order-help">
        Trang này chỉ hiển thị các món thuộc yêu cầu của bạn, không phải toàn bộ hóa đơn bàn.
      </p>
    </article>
  )
}
