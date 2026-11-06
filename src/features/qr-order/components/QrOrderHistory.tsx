import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useQrGuestAccess } from '../hooks/useQrGuestAccess'
import { entryPath, receiptLabel } from '../policies/qrOrderPolicy'
import { publicQrOrderKeys } from '../api/publicQrOrderKeys'
import type { QrReceipt } from '../types'
export function QrOrderHistory() {
  const access = useQrGuestAccess()
  const client = useQueryClient()
  return (
    <section className="qr-order-history" aria-label="Yêu cầu của bạn">
      <span className="qr-order-eyebrow">THEO DÕI YÊU CẦU</span>
      <h2>Yêu cầu của bạn</h2>
      <p className="qr-order-muted">
        Yêu cầu được khôi phục khi tải lại trong cùng tab, đến khi lượt gọi món hết hạn. Nhà hàng xác nhận từng yêu cầu.
      </p>
      {!access.storageAvailable && (
        <p className="qr-order-notice">
          Trình duyệt chưa lưu được lượt gọi món. Sau khi tải lại, bạn có thể không xem lại được yêu cầu đã gửi.
        </p>
      )}
      {!access.requestIds.length && (
        <div className="qr-order-empty">
          <span aria-hidden="true">📋</span>
          <h3>Chưa có yêu cầu nào</h3>
          <p>Chọn món và gửi yêu cầu để bắt đầu.</p>
        </div>
      )}
      {access.invalid && (
        <p className="qr-order-notice">
          Lượt truy cập đã hết hạn. Vui lòng liên hệ nhân viên để kiểm tra các yêu cầu của bạn.
        </p>
      )}
      {access.entry &&
        [...access.requestIds].reverse().map((id, index) => {
          const receipt = client.getQueryData<QrReceipt>(publicQrOrderKeys.receipt(access.scopeId, id))
          return (
            <Link className="qr-order-history-card" key={id} to={entryPath(access.entry!) + '/requests/' + id}>
              <div>
                <strong>Yêu cầu #{access.requestIds.length - index}</strong>
                <p>{receipt ? receiptLabel(receipt) : 'Xem kết quả yêu cầu'}</p>
              </div>
              <span aria-hidden="true">→</span>
            </Link>
          )
        })}
    </section>
  )
}
