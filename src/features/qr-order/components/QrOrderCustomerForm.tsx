import { useForm } from 'react-hook-form'
import type { QrCustomerFields } from '../store/qrOrderDraftStore'
export function QrOrderCustomerForm({
  fields,
  takeaway,
  frozen,
  disabled,
  pending,
  onChange,
  onSubmit,
}: {
  fields: QrCustomerFields
  takeaway: boolean
  frozen: boolean
  disabled: boolean
  pending: boolean
  onChange: (fields: Partial<QrCustomerFields>) => void
  onSubmit: () => Promise<void>
}) {
  const form = useForm<QrCustomerFields>({ defaultValues: fields })
  const register = (name: keyof QrCustomerFields) =>
    form.register(name, {
      maxLength: {
        value: name === 'note' ? 500 : name === 'customerName' ? 100 : 30,
        message: 'Thông tin vượt độ dài cho phép.',
      },
      validate: (value) =>
        name === 'customerName' && takeaway && !value.trim() ? 'Vui lòng nhập tên nhận hàng.' : true,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onChange({ [name]: event.target.value }),
    })
  return (
    <form className="qr-order-customer-form" onSubmit={form.handleSubmit(onSubmit)}>
      <fieldset disabled={frozen}>
        <legend>{takeaway ? 'Thông tin nhận món' : 'Thông tin khách (tùy chọn)'}</legend>
        <label>
          {takeaway ? 'Tên nhận hàng' : 'Tên khách'}
          <input
            autoComplete="name"
            maxLength={100}
            placeholder={takeaway ? 'Nhập tên nhận hàng' : 'Tên của bạn'}
            {...register('customerName')}
          />
        </label>
        <label>
          Số điện thoại (tùy chọn)
          <input
            type="tel"
            autoComplete="tel"
            maxLength={30}
            placeholder="Số điện thoại liên hệ"
            {...register('customerPhone')}
          />
        </label>
        <label>
          Ghi chú chung
          <textarea
            maxLength={500}
            rows={2}
            placeholder={takeaway ? 'Ví dụ: nhận tại quầy...' : 'Yêu cầu thêm của bạn...'}
            {...register('note')}
          />
        </label>
        {Object.values(form.formState.errors).map((error, index) => (
          <p className="qr-order-field-error" role="alert" key={index}>
            {error.message}
          </p>
        ))}
      </fieldset>
      <button
        type="submit"
        className="qr-order-button qr-order-primary qr-order-send"
        disabled={disabled || form.formState.isSubmitting}
      >
        {pending ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu gọi món'}
      </button>
    </form>
  )
}
