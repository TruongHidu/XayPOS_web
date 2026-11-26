import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { qrQuantitySchema } from '../schemas'
import { formatMinor, previewLine, quantityMilli } from '../../../shared/utils/scaledDecimal'

/**
 * Quantity stepper, optional kitchen note and the apply button in one row.
 * With `unitPrice` the button also shows the line total.
 */
export function QrOrderLineEditor({
  initialQuantity = '1',
  initialNote = '',
  disabled,
  onApply,
  label = 'Thêm vào giỏ',
  unitPrice,
  currencyCode,
}: {
  initialQuantity?: string
  initialNote?: string
  disabled?: boolean
  onApply: (quantity: string, note: string) => void
  label?: string
  unitPrice?: number
  currencyCode?: string
}) {
  const form = useForm({ defaultValues: { quantity: initialQuantity, note: initialNote } })
  const quantity = useWatch({ control: form.control, name: 'quantity' })
  const [noteOpen, setNoteOpen] = useState(!!initialNote)
  const change = (step: bigint) => {
    try {
      const value = quantityMilli(quantity) + step
      if (value <= 0n || value > 20000n) return
      const text =
        (value / 1000n).toString() +
        (value % 1000n ? '.' + (value % 1000n).toString().padStart(3, '0').replace(/0+$/, '') : '')
      form.setValue('quantity', text, { shouldValidate: true })
    } catch {
      form.setValue('quantity', '1')
    }
  }
  let total: string | null = null
  if (unitPrice !== undefined) {
    try {
      total = formatMinor(previewLine(unitPrice, quantity), currencyCode)
    } catch {
      total = null
    }
  }
  return (
    <form className="qr-order-line-editor" onSubmit={form.handleSubmit((value) => onApply(value.quantity, value.note))}>
      <fieldset disabled={disabled}>
        {noteOpen ? (
          <label className="qr-order-note-field">
            Ghi chú món
            <textarea
              maxLength={500}
              rows={2}
              placeholder="Ví dụ: ít cay, không hành..."
              {...form.register('note', { maxLength: 500 })}
            />
          </label>
        ) : (
          <button type="button" className="qr-order-note-toggle" onClick={() => setNoteOpen(true)}>
            + Thêm ghi chú cho bếp
          </button>
        )}
        {form.formState.errors.quantity && (
          <p className="qr-order-field-error" role="alert">
            {form.formState.errors.quantity.message}
          </p>
        )}
        <div className="qr-order-editor-actions">
          <span className="qr-order-quantity" role="group" aria-label="Số lượng">
            <button
              type="button"
              aria-label="Giảm số lượng"
              disabled={Number(quantity) <= 1}
              onClick={() => change(-1000n)}
            >
              −
            </button>
            <input
              inputMode="decimal"
              aria-label="Số lượng"
              {...form.register('quantity', {
                validate: (value) => {
                  try {
                    quantityMilli(value)
                    qrQuantitySchema.parse(Number(value))
                    return true
                  } catch {
                    return 'Nhập số lượng từ 0,001 đến 20, tối đa 3 chữ số thập phân.'
                  }
                },
              })}
            />
            <button
              type="button"
              aria-label="Tăng số lượng"
              disabled={Number(quantity) >= 20}
              onClick={() => change(1000n)}
            >
              +
            </button>
          </span>
          <button className="qr-order-button qr-order-primary qr-order-apply" type="submit" aria-label={label}>
            <span>{label}</span>
            {total && <span className="qr-order-apply-total">{total}</span>}
          </button>
        </div>
      </fieldset>
    </form>
  )
}
