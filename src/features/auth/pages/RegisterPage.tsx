import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { registerSchema, type RegisterFormValues } from '../api/authSchemas'
import { AuthLayout } from '../components/AuthLayout'
import { PasswordField } from '../components/PasswordField'
import { generateRestaurantCode } from '../utils/restaurantCode'
import { packageSelection } from '../../onboarding/utils/packageSelection'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import type { RegisterRestaurantRequest } from '../../../shared/types/auth'

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh'
const DEFAULT_CURRENCY = 'VND'
const FORM_FIELDS = ['restaurantName', 'ownerName', 'ownerEmail', 'ownerPhone', 'password'] as const

const isFormField = (field: string): field is (typeof FORM_FIELDS)[number] => (FORM_FIELDS as readonly string[]).includes(field)

function toRequest(values: RegisterFormValues): RegisterRestaurantRequest {
  return {
    restaurantCode: generateRestaurantCode(values.restaurantName),
    restaurantName: values.restaurantName,
    timezone: DEFAULT_TIMEZONE,
    currencyCode: DEFAULT_CURRENCY,
    ownerName: values.ownerName,
    ownerEmail: values.ownerEmail.toLowerCase(),
    ownerPhone: values.ownerPhone || undefined,
    password: values.password,
  }
}

export function RegisterPage() {
  const [searchParams] = useSearchParams()
  const packageCode = searchParams.get('package')
  const signUp = useAuthStore((state) => state.signUp)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [uncertainResult, setUncertainResult] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
    defaultValues: { restaurantName: '', ownerName: '', ownerEmail: '', ownerPhone: '', password: '' },
  })

  // Must be stored up front: PublicOnlyRoute redirects as soon as signUp sets the user.
  useEffect(() => packageSelection.write(packageCode), [packageCode])

  const onSubmit = async (values: RegisterFormValues) => {
    setGeneralError(null)
    setUncertainResult(false)
    try {
      await signUp(toRequest(values))
    } catch (error) {
      const normalized = normalizeApiError(error)
      if (normalized.code === 'RESTAURANT_CODE_EXISTS') {
        try {
          await signUp(toRequest(values))
          return
        } catch (retryError) {
          showError(normalizeApiError(retryError))
          return
        }
      }
      showError(normalized)
    }
  }

  const showError = (normalized: ReturnType<typeof normalizeApiError>) => {
    if (normalized.isNetworkError) {
      setUncertainResult(true)
      return
    }
    if (normalized.code === 'EMAIL_EXISTS') {
      setError('ownerEmail', { message: 'Email này đã được đăng ký. Hãy đăng nhập để tiếp tục.' })
      return
    }
    const fields = Object.entries(normalized.fieldErrors).filter(([field]) => isFormField(field))
    fields.forEach(([field, message]) => {
      if (isFormField(field)) setError(field, { message })
    })
    if (fields.length === 0) setGeneralError(normalized.message)
  }

  return (
    <AuthLayout title="Đăng ký nhà hàng" description="Tạo tài khoản chủ quán, sau đó chọn gói phù hợp.">
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
        {generalError && <div className="brand-alert brand-alert-error" role="alert">{generalError}</div>}
        {uncertainResult && (
          <div className="brand-alert brand-alert-error" role="alert">
            Không nhận được phản hồi từ máy chủ. Tài khoản có thể đã được tạo, hãy thử{' '}
            <Link to="/login">đăng nhập</Link> trước khi đăng ký lại.
          </div>
        )}
        <div className="auth-group-title">Nhà hàng</div>
        <div className="field">
          <label htmlFor="restaurantName">Tên nhà hàng</label>
          <input id="restaurantName" autoComplete="organization" {...register('restaurantName')} aria-invalid={Boolean(errors.restaurantName)} aria-describedby={errors.restaurantName ? 'restaurantName-error' : undefined} />
          {errors.restaurantName && <span id="restaurantName-error" className="field-error">{errors.restaurantName.message}</span>}
        </div>
        <div className="auth-group-title">Chủ quán</div>
        <div className="field">
          <label htmlFor="ownerName">Họ tên</label>
          <input id="ownerName" autoComplete="name" {...register('ownerName')} aria-invalid={Boolean(errors.ownerName)} aria-describedby={errors.ownerName ? 'ownerName-error' : undefined} />
          {errors.ownerName && <span id="ownerName-error" className="field-error">{errors.ownerName.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="ownerEmail">Email</label>
          <input id="ownerEmail" type="email" autoComplete="email" {...register('ownerEmail')} aria-invalid={Boolean(errors.ownerEmail)} aria-describedby={errors.ownerEmail ? 'ownerEmail-error' : undefined} />
          {errors.ownerEmail && <span id="ownerEmail-error" className="field-error">{errors.ownerEmail.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="ownerPhone">Số điện thoại <span className="auth-optional">(không bắt buộc)</span></label>
          <input id="ownerPhone" type="tel" autoComplete="tel" {...register('ownerPhone')} aria-invalid={Boolean(errors.ownerPhone)} aria-describedby={errors.ownerPhone ? 'ownerPhone-error' : undefined} />
          {errors.ownerPhone && <span id="ownerPhone-error" className="field-error">{errors.ownerPhone.message}</span>}
        </div>
        <PasswordField id="password" label="Mật khẩu" autoComplete="new-password" error={errors.password?.message} {...register('password')} />
        <button className="brand-button brand-button-primary brand-button-block brand-button-large" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}</button>
      </form>
      <p className="auth-switch">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
    </AuthLayout>
  )
}
