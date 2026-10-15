import { Link, useParams } from 'react-router-dom'
import { useQrEntry } from '../../features/qr-order/hooks/useQrEntry'
import { useQrGuestAccess } from '../../features/qr-order/hooks/useQrGuestAccess'
import { useQrOrderReceipt } from '../../features/qr-order/hooks/useQrOrderReceipt'
import { entryPath } from '../../features/qr-order/policies/qrOrderPolicy'
import { QrOrderFeedback } from '../../features/qr-order/components/QrOrderFeedback'
import { QrOrderReceipt } from '../../features/qr-order/components/QrOrderReceipt'
import { qrOrderError } from '../../features/qr-order/utils/qrOrderErrors'
import { publicEntrySchema } from '../../features/qr-order/schemas'
import { resourceId } from '../../shared/api/tenantSchemas'
import { QrMenuHeader } from '../../features/qr-menu/components/QrMenuHeader'
export function QrRequestPage() {
  const entry = useQrEntry()
  const { requestId = '' } = useParams<{ requestId: string }>()
  const access = useQrGuestAccess()
  const query = useQrOrderReceipt(requestId)
  const valid = publicEntrySchema.safeParse(entry).success && resourceId.safeParse(requestId).success
  const sameEntry = access.entry?.entryType === entry.entryType && access.entry?.token === entry.token
  return (
    <main className="qr-menu-page qr-order-page">
      <div className="qr-menu-container qr-order-receipt-container">
        {valid && (
          <Link className="qr-order-back" to={entryPath(entry)}>
            ← Quay lại thực đơn
          </Link>
        )}
        {!valid ? (
          <div className="qr-order-feedback" role="alert">
            Đường dẫn yêu cầu không hợp lệ. Vui lòng mở lại link nhà hàng.
          </div>
        ) : !sameEntry || !access.guest ? (
          <section className="qr-order-receipt qr-order-empty">
            <span aria-hidden="true">🔒</span>
            <h1>
              {sameEntry && access.invalid
                ? 'Lượt gọi món đã hết hạn hoặc bị thu hồi'
                : 'Chưa có quyền xem yêu cầu này'}
            </h1>
            <p>
              {sameEntry && access.invalid
                ? 'Không thể khôi phục quyền xem khi lượt gọi món không còn hiệu lực. Vui lòng liên hệ nhân viên để kiểm tra yêu cầu đã gửi.'
                : 'Hãy mở yêu cầu trong đúng tab trình duyệt đã gọi món. Link yêu cầu không tự cấp quyền xem; nếu đã đóng tab hoặc xóa dữ liệu phiên, vui lòng liên hệ nhân viên.'}
            </p>
          </section>
        ) : (
          <>
            <QrMenuHeader restaurant={access.guest.restaurant} table={access.guest.table ?? undefined} />
            {!access.storageAvailable && (
              <p className="qr-order-notice" role="status">
                Trình duyệt chưa lưu được lượt gọi món. Tải lại hoặc đóng tab có thể làm mất quyền theo dõi yêu cầu.
              </p>
            )}
            {access.invalid && (
              <p className="qr-order-notice" role="alert">
                Lượt truy cập đã hết hạn hoặc bị thu hồi. Liên hệ nhân viên để kiểm tra; kết quả đã tải dưới đây có thể
                chưa cập nhật.
              </p>
            )}
            {access.waitSeconds > 0 && (
              <p className="qr-order-notice" role="status">
                Vui lòng chờ {access.waitSeconds} giây để cập nhật tiếp.
              </p>
            )}
            <QrOrderFeedback failure={query.error ? qrOrderError(query.error) : null} />
            {query.isPending && !access.invalid && !access.waitSeconds && (
              <p role="status">
                {navigator.onLine
                  ? 'Đang tải yêu cầu...'
                  : 'Bạn đang ngoại tuyến. Yêu cầu sẽ được kiểm tra khi có kết nối.'}
              </p>
            )}
            {query.data && (
              <>
                <QrOrderReceipt receipt={query.data} />
                {query.error && (
                  <p className="qr-order-muted">
                    Thông tin gần nhất: {new Date(query.dataUpdatedAt).toLocaleString('vi-VN')}.
                  </p>
                )}
              </>
            )}
            <div className="qr-order-receipt-actions">
              <button
                type="button"
                className="qr-order-button"
                disabled={access.invalid || !!access.waitSeconds || query.isFetching || !navigator.onLine}
                onClick={() => void query.refetch()}
              >
                Làm mới yêu cầu
              </button>
              <Link className="qr-order-button qr-order-primary" to={entryPath(entry)}>
                {entry.entryType === 'TABLE' ? 'Chọn món / Gọi thêm' : 'Đặt thêm món'}
              </Link>
            </div>
            {entry.entryType === 'RESTAURANT' && (
              <p className="qr-order-muted qr-order-help">Mỗi yêu cầu mang đi được xác nhận tạo một đơn riêng.</p>
            )}
          </>
        )}
      </div>
    </main>
  )
}
