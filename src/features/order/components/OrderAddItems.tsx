import { useState } from 'react'
import type { Order } from '../types'
import type { PrivateMenuItem } from '../../menu/schemas'
import { Modal } from '../../../shared/components/AdminUi'
import { MenuPicker } from './MenuPicker'
import { useOrderMutations } from '../hooks/useOrderMutations'
import { quantityMilli } from '../../../shared/utils/scaledDecimal'
import { OrderFeedback } from './OrderUi'
import { newOrderId } from '../utils/orderId'
export function OrderAddItems({ order, onClose }: { order: Order; onClose: () => void }) {
  const mutation = useOrderMutations(order)
  const [lines, setLines] = useState<{ id: string; item: PrivateMenuItem; quantity: string; note: string }[]>([])
  const [error, setError] = useState<unknown>(null)
  const close = () => {
    if (mutation.busy) return
    if (mutation.appendIntent) {
      onClose()
      return
    }
    if (lines.length && !window.confirm('Bỏ các món đang chọn chưa lưu?')) return
    onClose()
  }
  return (
    <Modal title="Gọi thêm món" onClose={close}>
      <div className="order-add-layout">
        <MenuPicker
          permission="ORDER_UPDATE"
          disabled={mutation.busy || mutation.uncertain || lines.length >= 100}
          onAdd={(item) => {
            setLines((prev) => {
              const existingIndex = prev.findIndex((l) => l.item.id === item.id && !l.note)
              if (existingIndex >= 0) {
                const existing = prev[existingIndex]
                const currentQty = parseFloat(existing.quantity) || 0
                const nextQty = currentQty + 1
                const nextQtyStr = Number.isInteger(nextQty) ? String(nextQty) : String(Number(nextQty.toFixed(3)))
                const next = [...prev]
                next[existingIndex] = { ...existing, quantity: nextQtyStr }
                return next
              }
              if (prev.length >= 100) return prev
              return [...prev, { id: newOrderId(), item, quantity: '1', note: '' }]
            })
          }}
        />
        <div className="order-form">
          <OrderFeedback error={error} />
          {lines.map((line) => (
            <fieldset key={line.id} disabled={mutation.busy || mutation.uncertain}>
              <legend>{line.item.name}</legend>
              <label>
                Số lượng
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  <button
                    type="button"
                    className="button button-small button-ghost"
                    style={{ minWidth: '32px', padding: '4px 8px' }}
                    onClick={() => {
                      const cur = parseFloat(line.quantity) || 0
                      const next = Math.max(1, cur - 1)
                      setLines(lines.map((l) => (l.id === line.id ? { ...l, quantity: String(next) } : l)))
                    }}
                  >
                    -
                  </button>
                  <input
                    inputMode="decimal"
                    style={{ width: '80px', textAlign: 'center' }}
                    value={line.quantity}
                    onChange={(e) =>
                      setLines(lines.map((l) => (l.id === line.id ? { ...l, quantity: e.target.value } : l)))
                    }
                  />
                  <button
                    type="button"
                    className="button button-small button-ghost"
                    style={{ minWidth: '32px', padding: '4px 8px' }}
                    onClick={() => {
                      const cur = parseFloat(line.quantity) || 0
                      const next = cur + 1
                      setLines(lines.map((l) => (l.id === line.id ? { ...l, quantity: String(next) } : l)))
                    }}
                  >
                    +
                  </button>
                </div>
              </label>
              <label>
                Ghi chú
                <input
                  maxLength={2000}
                  value={line.note}
                  onChange={(e) => setLines(lines.map((l) => (l.id === line.id ? { ...l, note: e.target.value } : l)))}
                />
              </label>
              <button type="button" onClick={() => setLines(lines.filter((l) => l.id !== line.id))}>
                Bỏ món
              </button>
            </fieldset>
          ))}
        </div>
      </div>
      {mutation.uncertain && (
        <p className="order-warning">
          {mutation.appendIntent
            ? 'Kết quả chưa xác định. Yêu cầu được giữ nguyên để kiểm tra lại; tải lại đơn không thay thế yêu cầu ban đầu.'
            : 'Đơn đã thay đổi. Giữ bản đang nhập và tải lại đơn để đối chiếu trước thao tác mới.'}
        </p>
      )}
      {mutation.appendIntent && (
        <button
          type="button"
          className="button button-primary"
          disabled={mutation.busy}
          onClick={async () => {
            try {
              await mutation.mutateAsync({ kind: 'add', input: mutation.appendIntent!.input, retry: true })
              onClose()
            } catch (e) {
              setError(e)
            }
          }}
        >
          Kiểm tra bằng yêu cầu gọi thêm ban đầu
        </button>
      )}
      <div className="order-actions">
        <button type="button" className="button button-ghost" disabled={mutation.busy} onClick={close}>
          Đóng
        </button>
        <button
          className="button button-primary"
          type="button"
          disabled={!lines.length || mutation.busy || mutation.uncertain}
          onClick={async () => {
            setError(null)
            try {
              for (const line of lines) quantityMilli(line.quantity)
              await mutation.mutateAsync({
                kind: 'add',
                input: {
                  expectedVersion: order.version,
                  submissionMode: 'SUBMIT',
                  items: lines.map((l) => ({
                    itemId: l.item.id,
                    quantity: Number(l.quantity),
                    note: l.note,
                  })),
                },
              })
              onClose()
            } catch (e) {
              setError(e)
            }
          }}
        >
          {mutation.busy ? 'Đang gửi...' : 'Gửi món thêm'}
        </button>
      </div>
    </Modal>
  )
}
