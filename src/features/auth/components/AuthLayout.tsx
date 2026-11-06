import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'
import { env } from '../../../shared/config/env'
import '../../../shared/styles/brand.css'
import '../auth.css'

const highlights = ['Gọi món tại bàn và mang đi', 'Khách tự gọi món qua mã QR', 'Thu tiền và in bill nhanh']

export function AuthLayout({ title, description, children }: PropsWithChildren<{ title: string; description: string }>) {
  return (
    <main className="brand-scope auth-page">
      <aside className="auth-aside">
        <Link className="brand-logo brand-logo-light" to="/">
          <span className="brand-logo-mark">P</span>
          {env.appName}
        </Link>
        <div>
          <p className="auth-aside-title">Vận hành nhà hàng gọn hơn mỗi ngày.</p>
          <ul className="brand-check-list">
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </aside>
      <section className="auth-panel">
        <div className="auth-card">
          <Link className="brand-logo auth-mobile-logo" to="/">
            <span className="brand-logo-mark">P</span>
            {env.appName}
          </Link>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  )
}
