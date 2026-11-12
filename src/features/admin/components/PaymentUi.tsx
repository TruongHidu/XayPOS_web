import { useState, type ReactNode } from 'react'
import { Modal } from '../../../shared/components/AdminUi'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import type { PaymentEventState, PaymentReviewReason, PurchaseStatus } from '../../../shared/types/adminPayments'
import { formatVnd } from '../../../shared/utils/adminFormatting'
import {
  eventStateLabel,
  eventStateTone,
  purchaseStatusLabel,
  purchaseStatusTone,
  reviewReasonInfo,
} from '../utils/paymentLabels'

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  return (
    <span className={`status-badge ${purchaseStatusTone[status]}`}>
      <span className="status-dot" />
      {purchaseStatusLabel[status] ?? status}
    </span>
  )
}

export function EventStateBadge({ state }: { state: PaymentEventState }) {
  return (
    <span className={`status-badge ${eventStateTone[state]}`}>
      <span className="status-dot" />
      {eventStateLabel[state] ?? state}
    </span>
  )
}

export function ReasonTag({ reason }: { reason: PaymentReviewReason | null }) {
  if (!reason) return null
  const info = reviewReasonInfo[reason]
  return (
    <span className="reason-tag" title={info?.hint}>
      {info?.label ?? reason}
    </span>
  )
}

export function Money({ amount }: { amount: number | null | undefined }) {
  return <>{amount === null || amount === undefined ? '—' : formatVnd(amount)}</>
}

export interface ReasonField {
  name: string
  label: string
  minLength: number
  maxLength: number
  multiline?: boolean
  placeholder?: string
}

/**
 * Confirmation dialog for operator decisions that must be justified in writing.
 * Validation mirrors the backend limits so the request is rarely rejected.
 */
export function ReasonDialog({
  title,
  description,
  fields,
  submitLabel,
  danger = false,
  extra,
  canSubmit = true,
  onSubmit,
  onClose,
}: {
  title: string
  description?: ReactNode
  fields: ReasonField[]
  submitLabel: string
  danger?: boolean
  extra?: ReactNode
  /** Extra precondition owned by the caller (e.g. a selection made inside `extra`). */
  canSubmit?: boolean
  onSubmit: (values: Record<string, string>) => Promise<unknown>
  onClose: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, ''])))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const invalid = fields.find((f) => (values[f.name] ?? '').trim().length < f.minLength)

  const submit = async () => {
    if (invalid || submitting || !canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])))
    } catch (failure) {
      setError(normalizeApiError(failure).message)
      setSubmitting(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {description && <div className="form-hint dialog-description">{description}</div>}
        {extra}
        {fields.map((field) => (
          <label className="field" key={field.name}>
            <span>{field.label}</span>
            {field.multiline ? (
              <textarea
                rows={3}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                value={values[field.name]}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              />
            ) : (
              <input
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                value={values[field.name]}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              />
            )}
            <small className="form-hint">Tối thiểu {field.minLength} ký tự.</small>
          </label>
        ))}
        {error && (
          <div className="inline-validation" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button className="button button-ghost" type="button" onClick={onClose}>
            Huỷ
          </button>
          <button
            className={`button ${danger ? 'button-danger' : 'button-primary'}`}
            type="submit"
            disabled={Boolean(invalid) || submitting || !canSubmit}
          >
            {submitting ? 'Đang xử lý…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
