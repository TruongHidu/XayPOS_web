import type { PropsWithChildren } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../auth/store/authStore'
import { BrandMark } from '../../../shared/components/BrandMark'
import { env } from '../../../shared/config/env'
import '../../../shared/styles/brand.css'
import '../onboarding.css'

const STEPS = ['Nhà hàng', 'Chọn gói', 'Thanh toán']

export function OnboardingLayout({ step, children }: PropsWithChildren<{ step: 0 | 1 | 2 }>) {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const signOut = useAuthStore((state) => state.signOut)

  return (
    <div className="brand-scope onboarding-page">
      <header className="onboarding-header">
        <Link className="brand-logo" to="/">
          <BrandMark className="brand-logo-mark" />
          {env.appName}
        </Link>
        <div className="onboarding-account">
          <span className="onboarding-restaurant">{user?.restaurantName}</span>
          <button
            className="brand-button brand-button-ghost"
            type="button"
            onClick={async () => {
              await signOut()
              navigate('/login', { replace: true })
            }}
          >
            Đăng xuất
          </button>
        </div>
      </header>
      <main className="onboarding-main">
        <ol className="onboarding-steps" aria-label="Các bước thiết lập">
          {STEPS.map((label, index) => (
            <li key={label} className={index === step ? 'is-current' : index < step ? 'is-done' : ''} aria-current={index === step ? 'step' : undefined}>
              <span className="onboarding-step-number">{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        {children}
      </main>
    </div>
  )
}
