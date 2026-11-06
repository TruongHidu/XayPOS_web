import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { loginSchema, type LoginFormValues } from '../api/authSchemas'
import { postLoginRoute } from '../../../shared/utils/routing'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import { AuthLayout } from '../components/AuthLayout'
import { PasswordField } from '../components/PasswordField'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const signIn = useAuthStore((state) => state.signIn)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema), mode: 'onBlur' })

  const onSubmit = async (values: LoginFormValues) => {
    setGeneralError(null)
    try {
      const response = await signIn(values)
      const requested = new URLSearchParams(location.search).get('returnUrl')
      navigate(postLoginRoute(response.user, requested), { replace: true })
    } catch (error) {
      const normalized = normalizeApiError(error)
      Object.entries(normalized.fieldErrors).forEach(([field, message]) => {
        if (field === 'email' || field === 'password') setError(field, { message })
      })
      if (normalized.fieldErrors.email || normalized.fieldErrors.password) return
      setGeneralError(normalized.message)
    }
  }

  return (
    <AuthLayout title="Đăng nhập" description="Nhập email và mật khẩu để tiếp tục.">
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
        {generalError && <div className="brand-alert brand-alert-error" role="alert">{generalError}</div>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" {...register('email')} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} />
          {errors.email && <span id="email-error" className="field-error">{errors.email.message}</span>}
        </div>
        <PasswordField id="password" label="Mật khẩu" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        <button className="brand-button brand-button-primary brand-button-block brand-button-large" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
      <p className="auth-switch">Chưa có tài khoản? <Link to="/register">Đăng ký nhà hàng</Link></p>
    </AuthLayout>
  )
}
