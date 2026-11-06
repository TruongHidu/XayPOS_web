import { useState, useRef, useEffect } from 'react'
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
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  const frozen = draftFrozen(s)
  const allowed = !!s.context && canCreateType(access, s.context.serviceType) && canMenu(access)

  const isDineIn = s.context?.serviceType === 'DINE_IN'
  const isTakeaway = s.context?.serviceType === 'TAKEAWAY'

  const linesContainerRef = useRef<HTMLDivElement>(null)
  const prevLineCount = useRef(s.lines.length)
  const [highlightId, setHighlightId] = useState<string | null>(null)

  useEffect(() => {
    if (s.lines.length > prevLineCount.current) {
      const lastLine = s.lines[s.lines.length - 1]
      if (lastLine) {
        setHighlightId(lastLine.id)
        const timer = setTimeout(() => setHighlightId(null), 1000)
        if (linesContainerRef.current) {
          if (typeof linesContainerRef.current.scrollTo === 'function') {
            linesContainerRef.current.scrollTo({
              top: linesContainerRef.current.scrollHeight,
              behavior: 'smooth',
            })
          } else {
            linesContainerRef.current.scrollTop = linesContainerRef.current.scrollHeight
          }
        }
        prevLineCount.current = s.lines.length
        return () => clearTimeout(timer)
      }
    }
    prevLineCount.current = s.lines.length
  }, [s.lines])

  const handleStepQuantity = (l: DraftLine, step: number) => {
    if (frozen) return
    try {
      const current = Number(l.quantity)
      const next = current + step
      if (next <= 0) {
        if (window.confirm(`Xóa món ${l.item.name} khỏi giỏ?`)) {
          s.remove(l.id)
        }
      } else {
        s.edit(l.id, String(next), l.note)
      }
    } catch {
      // ignore
    }
  }

  const handleRemoveLine = (l: DraftLine) => {
    if (frozen) return
    if (window.confirm(`Xóa món ${l.item.name} khỏi giỏ?`)) {
      s.remove(l.id)
    }
  }

  const handleClearCart = () => {
    if (frozen) return
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ giỏ hàng không?')) {
      s.discard()
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
        <div className="pos-cart-header-actions">
          {s.lines.length > 0 && !frozen && (
            <button
              type="button"
              className="pos-cart-clear-btn"
              onClick={handleClearCart}
              title="Xóa toàn bộ giỏ hàng"
            >
              Xóa giỏ
            </button>
          )}
          <div className={`pos-cart-badge ${isTakeaway ? 'takeaway' : 'dine-in'}`}>
            {isTakeaway ? '🛍️ Mang đi' : '🪑 Tại bàn'}
          </div>
        </div>
      </div>

      <OrderFeedback
        error={s.error}
        onRetry={s.uncertain && !s.pending ? () => void s.submit() : undefined}
        label="Kiểm tra bằng yêu cầu ban đầu"
      />

      {s.uncertain && (
        <div className="order-warning pos-uncertain-alert" role="alert">
          <p>Kết quả chưa xác định. Giỏ đã khóa; key và payload giữ nguyên khi kiểm tra lại.</p>
          <button
            type="button"
            className="button button-primary pos-retry-submit-btn"
            disabled={s.pending}
            onClick={() => void s.submit()}
          >
            {s.pending ? 'Đang kiểm tra...' : 'Thử lại'}
          </button>
        </div>
      )}

      {s.refused && (
        <p className="order-warning" role="alert">
          Backend từ chối quyền/tính năng. Không gửi lại. Liên hệ quản lý hoặc đăng nhập lại sau khi quyền được cập nhật.
        </p>
      )}

      {/* Cart Lines */}
      <div className="order-cart-lines" ref={linesContainerRef}>
        {s.lines.length === 0 && (
          <div className="pos-empty-cart">
            <span className="pos-empty-cart-icon" aria-hidden="true">
              {isDineIn ? '🪑' : '🛒'}
            </span>
            <p className="order-empty">
              {isDineIn && !s.context?.tableName
                ? 'Vui lòng chọn bàn từ sơ đồ trước khi chọn món.'
                : 'Giỏ món đang trống. Chọn món từ thực đơn để bắt đầu.'}
            </p>
          </div>
        )}

        {s.lines.map((l) => (
          <article
            key={l.id}
            className={`order-cart-line ${highlightId === l.id ? 'is-recently-added' : ''}`}
          >
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

            <div className="pos-line-note-container">
              {expandedNoteId === l.id ? (
                <div className="pos-inline-note-form">
                  <input
                    maxLength={2000}
                    value={l.note}
                    onChange={(e) => s.edit(l.id, l.quantity, e.target.value)}
                    placeholder="Ghi chú món (VD: ít đá, không hành...)"
                    aria-label={`Ghi chú cho ${l.item.name}`}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="pos-inline-note-done"
                    onClick={() => setExpandedNoteId(null)}
                  >
                    Xong
                  </button>
                </div>
              ) : l.note ? (
                <div className="pos-line-note-display" onClick={() => !frozen && setExpandedNoteId(l.id)}>
                  <small className="pos-line-note">📝 {l.note}</small>
                  {!frozen && <span className="pos-note-edit-hint">Sửa</span>}
                </div>
              ) : null}
            </div>

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
                className="pos-line-btn-note"
                disabled={frozen}
                onClick={() => setExpandedNoteId(expandedNoteId === l.id ? null : l.id)}
                aria-label={l.note ? 'Sửa ghi chú' : 'Thêm ghi chú'}
              >
                📝 {l.note ? 'Ghi chú' : '+ Ghi chú'}
              </button>

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
                onClick={() => handleRemoveLine(l)}
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
