import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { loginSchema, type LoginFormValues } from '../api/authSchemas'
import { defaultRouteForUser, safeReturnUrl } from '../../../shared/utils/routing'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import { env } from '../../../shared/config/env'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const signIn = useAuthStore((state) => state.signIn)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema), mode: 'onBlur' })

  const onSubmit = async (values: LoginFormValues) => {
    setGeneralError(null)
    try {
      const response = await signIn(values)
      const returnUrl = safeReturnUrl(new URLSearchParams(location.search).get('returnUrl'))
      navigate(returnUrl ?? defaultRouteForUser(response.user), { replace: true })
    } catch (error) {
      const normalized = normalizeApiError(error)
      Object.entries(normalized.fieldErrors).forEach(([field, message]) => {
        if (field === 'email' || field === 'password') setError(field, { message })
      })
      if (normalized.fieldErrors.email || normalized.fieldErrors.password) return
      setGeneralError(normalized.message)
    }
  }

  return <main className="login-page">
    <section className="login-visual">
      <a className="brand" href="/" onClick={(event) => event.preventDefault()}><span className="brand-mark">P</span><span><strong>{env.appName}</strong><small>Restaurant operations platform</small></span></a>
      <div><h1>Vận hành nhà hàng rõ ràng hơn.</h1><p>Một không gian quản trị thống nhất cho đội ngũ nhà hàng — từ subscription đến ca bán hàng.</p></div>
      <div className="visual-footer">Secure access · Multi-tenant ready · Phase 1</div>
    </section>
    <section className="login-panel"><form className="login-form" onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
      <div className="eyebrow">Welcome back</div><h2>Đăng nhập</h2><p className="muted">Sử dụng tài khoản được cấp để tiếp tục.</p>
      {generalError && <div className="general-error" role="alert">{generalError}</div>}
      <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" {...register('email')} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} />{errors.email && <span id="email-error" className="field-error">{errors.email.message}</span>}</div>
      <div className="field"><label htmlFor="password">Mật khẩu</label><div className="password-control"><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" {...register('password')} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} /><button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{showPassword ? 'Ẩn' : 'Hiện'}</button></div>{errors.password && <span id="password-error" className="field-error">{errors.password.message}</span>}</div>
      <button className="button button-primary login-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      <div className="phase-note">Phase 1 · Hỗ trợ phiên đăng nhập an toàn trong cùng tab</div>
    </form></section>
  </main>
}
