import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '../../../shared/components/AdminUi'
import { useOrderDraftStore, draftFrozen, draftTotal, type DraftLine } from '../store/orderDraftStore'
import { formatMinor, previewLine, quantityMilli } from '../../../shared/utils/scaledDecimal'
import { useOrderAccess } from '../hooks/useOrderAccess'
import { canCreateType, canMenu } from '../policies/orderAccessPolicy'
import { OrderFeedback } from './OrderUi'

export function OrderCart() {
  const s = useOrderDraftStore()
  const { access } = useOrderAccess()
  const [line, setLine] = useState<DraftLine | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const frozen = draftFrozen(s)
  const allowed = !!s.context && canCreateType(access, s.context.serviceType) && canMenu(access)

  const isDineIn = s.context?.serviceType === 'DINE_IN'
  const isTakeaway = s.context?.serviceType === 'TAKEAWAY'

  const handleStepQuantity = (l: DraftLine, step: number) => {
    if (frozen) return
    try {
      const current = Number(l.quantity)
      const next = current + step
      if (next <= 0) {
        s.remove(l.id)
      } else {
        s.edit(l.id, String(next), l.note)
      }
    } catch {
      // ignore
    }
  }

  return (
    <aside className={`order-cart ${isTakeaway ? 'theme-takeaway' : 'theme-dine-in'}`} aria-label="Giỏ món">
      <div className="order-panel-heading pos-cart-header">
        <div>
          <h3>
            Giỏ món <span className="order-count">{s.lines.length}</span>
          </h3>
          <span className="order-muted pos-cart-service-label">
            {s.context?.tableName ?? (isTakeaway ? 'Mang đi' : 'Chưa chọn bàn')}
          </span>
        </div>
        <div className={`pos-cart-badge ${isTakeaway ? 'takeaway' : 'dine-in'}`}>
          {isTakeaway ? '🛍️ Mang đi' : '🪑 Tại bàn'}
        </div>
      </div>

      <OrderFeedback
        error={s.error}
        onRetry={s.uncertain && !s.pending ? () => void s.submit() : undefined}
        label="Kiểm tra bằng yêu cầu ban đầu"
      />

      {s.uncertain && (
        <p className="order-warning" role="alert">
          Kết quả chưa xác định. Giỏ đã khóa; key và payload giữ nguyên khi kiểm tra lại.
        </p>
      )}

      {s.refused && (
        <p className="order-warning" role="alert">
          Backend từ chối quyền/tính năng. Không gửi lại. Liên hệ quản lý hoặc đăng nhập lại sau khi quyền được cập nhật.
        </p>
      )}

      {/* Cart Lines */}
      <div className="order-cart-lines">
        {s.lines.length === 0 && (
          <div className="pos-empty-cart">
            <span className="pos-empty-cart-icon" aria-hidden="true">🛒</span>
            <p className="order-empty">Chọn món từ thực đơn để bắt đầu.</p>
          </div>
        )}

        {s.lines.map((l) => (
          <article key={l.id} className="order-cart-line">
            <div className="pos-line-header">
              <div>
                <strong>{l.item.name}</strong>
                <span className="pos-line-unit">
                  {l.quantity} {l.item.baseUnit}
                </span>
              </div>
              <p className="pos-line-subtotal">
                {formatMinor(previewLine(l.item.salePrice, l.quantity))}
              </p>
            </div>

            {l.note && <small className="pos-line-note">📝 {l.note}</small>}

            <div className="order-line-actions">
              <div className="pos-qty-stepper">
                <button
                  type="button"
                  className="pos-qty-btn"
                  disabled={frozen}
                  onClick={() => handleStepQuantity(l, -1)}
                  aria-label="Giảm 1"
                >
                  -
                </button>
                <span className="pos-qty-val">{l.quantity}</span>
                <button
                  type="button"
                  className="pos-qty-btn"
                  disabled={frozen}
                  onClick={() => handleStepQuantity(l, 1)}
                  aria-label="Tăng 1"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                className="pos-line-btn-edit"
                disabled={frozen}
                onClick={() => setLine(l)}
              >
                Số lượng / ghi chú
              </button>

              <button
                type="button"
                className="pos-line-btn-remove"
                disabled={frozen}
                onClick={() => s.remove(l.id)}
                aria-label="Bỏ món"
              >
                Bỏ món
              </button>
            </div>
          </article>
        ))}
      </div>

      {/* Customer / Order Meta Form */}
      <div className="pos-cart-meta-section">
        <button
          type="button"
          className="pos-cart-toggle-meta"
          onClick={() => setShowDetails(!showDetails)}
        >
          <span>👤 Thông tin khách & ghi chú</span>
          <span className="pos-toggle-arrow">{showDetails ? '▲' : '▼'}</span>
        </button>

        <div className={`order-form ${showDetails ? 'is-expanded' : 'is-collapsed'}`}>
          <label>
            Tên khách (tùy chọn)
            <input
              maxLength={100}
              readOnly={frozen}
              placeholder="VD: Anh Minh"
              value={s.metadata.customerName}
              onChange={(e) => s.fields({ customerName: e.target.value })}
            />
          </label>
          <label>
            Số điện thoại (tùy chọn)
            <input
              type="tel"
              maxLength={30}
              readOnly={frozen}
              placeholder="VD: 0912..."
              value={s.metadata.customerPhone}
              onChange={(e) => s.fields({ customerPhone: e.target.value })}
            />
          </label>
          {isDineIn && (
            <label>
              Số khách
              <input
                inputMode="numeric"
                readOnly={frozen}
                value={s.metadata.guestCount}
                onChange={(e) => s.fields({ guestCount: e.target.value })}
              />
            </label>
          )}
          <label>
            Ghi chú đơn
            <textarea
              maxLength={2000}
              readOnly={frozen}
              placeholder="Ghi chú chung cho đơn hàng..."
              value={s.metadata.note}
              onChange={(e) => s.fields({ note: e.target.value })}
            />
          </label>
        </div>
      </div>

      {/* Cart Summary & Checkout */}
      <div className="pos-cart-footer">
        <div className="order-cart-total">
          <span>Tổng dự kiến</span>
          <strong>{formatMinor(draftTotal(s.lines))}</strong>
        </div>

        <p className="order-muted">Giá, tiền tệ và tổng chính thức do backend xác định.</p>

        <button
          className="button button-primary order-submit"
          type="button"
          disabled={!allowed || frozen || !s.lines.length}
          onClick={() => void s.submit()}
        >
          {s.pending ? 'Đang gửi...' : 'Gửi đơn'}
        </button>
      </div>

      {/* Edit Line Modal */}
      {line && (
        <Modal title={'Sửa ' + line.item.name} onClose={() => setLine(null)}>
          <DraftLineForm
            line={line}
            onApply={(quantity, note) => {
              s.edit(line.id, quantity, note)
              setLine(null)
            }}
          />
        </Modal>
      )}
    </aside>
  )
}

function DraftLineForm({ line, onApply }: { line: DraftLine; onApply: (quantity: string, note: string) => void }) {
  const f = useForm({ defaultValues: { quantity: line.quantity, note: line.note } })
  return (
    <form className="order-form" onSubmit={f.handleSubmit((v) => onApply(v.quantity, v.note))}>
      <label>
        Số lượng
        <input
          inputMode="decimal"
          {...f.register('quantity', {
            validate: (v) => {
              try {
                quantityMilli(v)
                return true
              } catch {
                return 'Số lượng >0, tối đa 3 thập phân.'
              }
            },
          })}
        />
      </label>
      {f.formState.errors.quantity && <p role="alert" className="field-error">{f.formState.errors.quantity.message}</p>}
      <label>
        Ghi chú món
        <textarea maxLength={2000} placeholder="VD: Ít cay, không hành..." {...f.register('note')} />
      </label>
      <div className="order-actions">
        <button type="submit" className="button button-primary">Áp dụng</button>
      </div>
    </form>
  )
}
