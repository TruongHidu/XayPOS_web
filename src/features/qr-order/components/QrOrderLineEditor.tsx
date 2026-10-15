import { useForm, useWatch } from 'react-hook-form'
import { qrQuantitySchema } from '../schemas'
import { quantityMilli } from '../../../shared/utils/scaledDecimal'
export function QrOrderLineEditor({
  initialQuantity = '1',
  initialNote = '',
  disabled,
  onApply,
  label = 'Thêm vào giỏ',
}: {
  initialQuantity?: string
  initialNote?: string
  disabled?: boolean
  onApply: (quantity: string, note: string) => void
  label?: string
}) {
  const form = useForm({ defaultValues: { quantity: initialQuantity, note: initialNote } })
  const quantity = useWatch({ control: form.control, name: 'quantity' })
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
  return (
    <form className="qr-order-line-editor" onSubmit={form.handleSubmit((value) => onApply(value.quantity, value.note))}>
      <fieldset disabled={disabled}>
        <label>
          Số lượng
          <span className="qr-order-quantity">
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
        </label>
        {form.formState.errors.quantity && (
          <p className="qr-order-field-error" role="alert">
            {form.formState.errors.quantity.message}
          </p>
        )}
        <label>
          Ghi chú món{' '}
          <textarea
            maxLength={500}
            rows={2}
            placeholder="Ví dụ: ít cay, không hành..."
            {...form.register('note', { maxLength: 500 })}
          />
        </label>
        <button className="qr-order-button qr-order-primary" type="submit">
          {label}
        </button>
      </fieldset>
    </form>
  )
}
