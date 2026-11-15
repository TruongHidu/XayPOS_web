import { useState, type ReactNode } from 'react'
import { Modal } from '../components/AdminUi'

export interface ConfirmDialogProps {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  /** Ask for a reason (e.g. cancel/void). The confirm button stays disabled until it has text. */
  reason?: { label: string; placeholder?: string; required?: boolean; maxLength?: number }
  busy?: boolean
  /** Error shown inside the dialog (keeps the dialog open so the user can retry). */
  error?: string | null
  onConfirm: (reason: string) => void
  onCancel: () => void
}

/** Confirmation for irreversible or destructive actions. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  tone = 'primary',
  reason,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [text, setText] = useState('')
  const missingReason = !!reason?.required && text.trim().length === 0
  return (
    <Modal title={title} onClose={busy ? () => undefined : onCancel} className="ui-confirm">
      <form
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy && !missingReason) onConfirm(text.trim())
        }}
      >
        <div className="ui-confirm-message">{message}</div>
        {reason && (
          <label className="field">
            <span>
              {reason.label}
              {reason.required ? ' *' : ''}
            </span>
            <textarea
              value={text}
              maxLength={reason.maxLength ?? 500}
              placeholder={reason.placeholder}
              rows={3}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
        )}
        {error && (
          <div className="general-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="button button-ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="submit"
            className={tone === 'danger' ? 'button button-danger-solid' : 'button button-primary'}
            disabled={busy || missingReason}
          >
            {busy ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
