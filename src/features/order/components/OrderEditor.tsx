import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Order, OrderLine } from '../types'
import { Modal } from '../../../shared/components/AdminUi'
import { useOrderMutations } from '../hooks/useOrderMutations'
import { buildOrderCommand, editorDefaults, type EditorFields, type EditorKind } from '../utils/orderCommands'
import { OrderFeedback } from './OrderUi'
export function OrderEditor({
  order,
  kind,
  line,
  onClose,
}: {
  order: Order
  kind: EditorKind
  line?: OrderLine
  onClose: () => void
}) {
  const form = useForm<EditorFields>({ defaultValues: editorDefaults(order, line) })
  const mutation = useOrderMutations(order)
  const [error, setError] = useState<unknown>(null)
  const close = () => {
    if (mutation.busy) return
    if (form.formState.isDirty && !window.confirm('Bỏ bản đang nhập chưa lưu?')) return
    onClose()
  }
  const title = {
    metadata: 'Thông tin đơn',
    line: 'Sửa dòng món',
    confirm: 'Xác nhận đơn',
    cancel: 'Hủy đơn',
    cancelLine: 'Hủy dòng món',
  }[kind]
  return (
    <Modal title={title} onClose={close}>
      <form
        className="order-form"
        onSubmit={form.handleSubmit(async (fields) => {
          setError(null)
          try {
            await mutation.mutateAsync(buildOrderCommand(kind, order, fields, line))
            onClose()
          } catch (e) {
            setError(e)
          }
        })}
      >
        <OrderFeedback error={error} />
        {mutation.uncertain && (
          <p className="order-warning">
            Bản đang nhập được giữ. Đóng hộp thoại và tải lại đơn để đối chiếu trước khi thực hiện lại; không tự đổi
            version.
          </p>
        )}
        {kind === 'metadata' && (
          <>
            <label>
              Tên khách
              <input maxLength={100} disabled={mutation.busy} {...form.register('customerName')} />
            </label>
            <label>
              Số điện thoại
              <input maxLength={30} disabled={mutation.busy} {...form.register('customerPhone')} />
            </label>
            <label>
              Số khách
              <input inputMode="numeric" disabled={mutation.busy} {...form.register('guestCount')} />
            </label>
            <label>
              Ghi chú đơn
              <textarea maxLength={2000} disabled={mutation.busy} {...form.register('note')} />
            </label>
          </>
        )}
        {kind === 'line' && (
          <>
            <label>
              Số lượng
              <input inputMode="decimal" disabled={mutation.busy} {...form.register('quantity')} />
            </label>
            <label>
              Ghi chú món
              <textarea maxLength={2000} disabled={mutation.busy} {...form.register('note')} />
            </label>
          </>
        )}
        {(kind === 'cancel' || kind === 'cancelLine') && (
          <label>
            Lý do hủy
            <textarea
              maxLength={1000}
              disabled={mutation.busy}
              {...form.register('reason', { required: 'Cần lý do hủy.' })}
            />
          </label>
        )}
        {kind === 'confirm' && (
          <p>Xác nhận gửi các món nháp vào bếp. Bạn vẫn có thể gọi thêm vào đơn này trước khi thanh toán.</p>
        )}
        {Object.values(form.formState.errors).map((e, i) => (
          <p key={i} role="alert">
            {e.message}
          </p>
        ))}
        <div className="order-actions">
          <button type="button" className="button button-ghost" disabled={mutation.busy} onClick={close}>
            Đóng
          </button>
          <button className="button button-primary" disabled={mutation.busy || mutation.uncertain}>
            {mutation.busy ? 'Đang lưu...' : 'Xác nhận'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
