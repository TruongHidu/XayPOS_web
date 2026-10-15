import { formatMinor, previewLine } from '../../../shared/utils/scaledDecimal'
import { qrDraftFrozen, useQrDraftStore } from '../store/qrOrderDraftStore'
import { useQrGuestStore } from '../store/qrOrderGuestStore'
import { useQrGuestAccess } from '../hooks/useQrGuestAccess'
import { useQrOrderSubmit } from '../hooks/useQrOrderSubmit'
import { QrOrderLineEditor } from './QrOrderLineEditor'
import { QrOrderCustomerForm } from './QrOrderCustomerForm'
import { QrOrderFeedback } from './QrOrderFeedback'
export function QrOrderCart({ currencyCode }: { currencyCode: string }) {
  const draft = useQrDraftStore()
  const access = useQrGuestAccess()
  const send = useQrOrderSubmit()
  const frozen = qrDraftFrozen(draft)
  const total = draft.lines.reduce((sum, line) => {
    try {
      return sum + previewLine(line.item.salePrice, line.quantity)
    } catch {
      return sum
    }
  }, 0n)
  return (
    <aside className="qr-order-cart" aria-label="Giỏ món của bạn">
      <header className="qr-order-panel-header">
        <div>
          <span className="qr-order-eyebrow">MÓN BẠN ĐÃ CHỌN</span>
          <h2>
            Giỏ món <span>{draft.lines.length}</span>
          </h2>
        </div>
        <span aria-hidden="true">🛍</span>
      </header>
      <QrOrderFeedback failure={draft.error} />
      {!access.storageAvailable && (
        <p className="qr-order-notice" role="status">
          Trình duyệt chưa lưu được lượt gọi món. Sau khi tải lại, bạn có thể mất quyền theo dõi yêu cầu; hãy giữ tab
          này mở.
        </p>
      )}
      {access.waitSeconds > 0 && (
        <p className="qr-order-notice" role="status">
          Vui lòng chờ {access.waitSeconds} giây trước khi thử lại.
        </p>
      )}
      {draft.unresolved && (
        <p className="qr-order-notice">
          Chưa xác minh được kết quả gửi. Nội dung được giữ nguyên; kiểm tra yêu cầu ban đầu để tránh gọi trùng món.
        </p>
      )}
      {access.invalid && (
        <div className="qr-order-notice" role="alert">
          <p>Lượt gọi món đã hết hạn hoặc không còn hiệu lực. Hãy kiểm tra với nhân viên về các yêu cầu đã gửi.</p>
          <button
            type="button"
            className="qr-order-button"
            disabled={draft.pending}
            onClick={() => {
              if (
                window.confirm(
                  'Chỉ bắt đầu lượt mới sau khi đã kiểm tra với nhân viên để tránh gọi trùng món. Giỏ và quyền xem các yêu cầu cũ sẽ bị xóa. Tiếp tục?',
                )
              )
                access.sync(access.entry, true)
            }}
          >
            Bắt đầu lượt gọi món mới
          </button>
        </div>
      )}
      {access.unavailable && (
        <p className="qr-order-notice">
          Nhà hàng hiện chưa nhận gọi món qua link này. Vui lòng gọi nhân viên; thực đơn vẫn có thể xem.
        </p>
      )}
      <div className="qr-order-cart-lines">
        {!draft.lines.length && (
          <div className="qr-order-empty">
            <span aria-hidden="true">🍽</span>
            <h3>Chọn món bạn thích</h3>
            <p>Món từ thực đơn sẽ xuất hiện tại đây.</p>
          </div>
        )}
        {draft.lines.map((line) => (
          <article key={line.id} className="qr-order-cart-line">
            <div className="qr-order-line-heading">
              <strong>{line.item.name}</strong>
              <button
                type="button"
                className="qr-order-remove"
                aria-label={'Bỏ ' + line.item.name}
                disabled={frozen}
                onClick={() => draft.remove(line.id)}
              >
                ×
              </button>
            </div>
            <div className="qr-order-line-price">
              <span>
                {line.quantity} {line.item.baseUnit}
              </span>
              <strong>{formatMinor(previewLine(line.item.salePrice, line.quantity), currencyCode)}</strong>
            </div>
            {line.note && <p className="qr-order-muted">{line.note}</p>}
            {line.item.availabilityStatus === 'OUT_OF_STOCK' && (
              <p className="qr-order-field-error">Món vừa hết hàng, hãy bỏ món này trước khi gửi.</p>
            )}
            <details>
              <summary>Sửa số lượng / ghi chú</summary>
              <QrOrderLineEditor
                initialQuantity={line.quantity}
                initialNote={line.note}
                disabled={frozen}
                label="Áp dụng"
                onApply={(quantity, note) => draft.edit(line.id, quantity, note)}
              />
            </details>
          </article>
        ))}
      </div>
      <div className="qr-order-total">
        <span>Tổng dự kiến</span>
        <strong>{formatMinor(total, currencyCode)}</strong>
      </div>
      <p className="qr-order-muted qr-order-help">
        Nhà hàng sẽ kiểm tra và xác nhận yêu cầu. Giá chốt có thể thay đổi.
      </p>
      <QrOrderCustomerForm
        key={draft.scopeId}
        fields={draft.fields}
        takeaway={access.entry?.entryType === 'RESTAURANT'}
        frozen={frozen}
        pending={draft.pending}
        onChange={draft.metadata}
        onSubmit={send}
        disabled={
          frozen ||
          access.invalid ||
          access.unavailable ||
          access.waitSeconds > 0 ||
          !draft.scopeId ||
          !draft.lines.length ||
          draft.lines.some((line) => line.item.availabilityStatus !== 'AVAILABLE')
        }
      />
      {draft.unresolved && draft.error?.code !== 'IDEMPOTENCY_KEY_REUSED' && (
        <button
          type="button"
          className="qr-order-button qr-order-retry"
          disabled={draft.pending || access.invalid || access.unavailable || access.waitSeconds > 0}
          onClick={() => void send()}
        >
          Kiểm tra lại yêu cầu ban đầu
        </button>
      )}
      {access.unavailable && !draft.unresolved && (
        <button
          type="button"
          className="qr-order-button"
          onClick={() => useQrGuestStore.setState({ unavailable: false })}
        >
          Kiểm tra lại chức năng gọi món
        </button>
      )}
    </aside>
  )
}
