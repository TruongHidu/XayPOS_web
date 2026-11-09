import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../auth/store/authStore'
import { BrandMark } from '../../../shared/components/BrandMark'
import { env } from '../../../shared/config/env'
import { PosPreview } from '../components/PosPreview'
import { PricingSection } from '../components/PricingSection'
import '../../../shared/styles/brand.css'
import '../landing.css'

const CONTACT = {
  phone: '0338730089',
  phoneDisplay: '0338 730 089',
  facebook: 'https://www.facebook.com/vantruongvjppro/',
}

const BENEFITS = [
  { title: 'Gọi món nhanh', text: 'Chọn bàn hoặc đơn mang đi, thêm món và gửi đơn chỉ với vài thao tác.' },
  { title: 'Khách tự gọi qua QR', text: 'Khách quét mã, xem thực đơn và gửi yêu cầu. Nhân viên duyệt trước khi vào đơn.' },
  { title: 'Thu tiền, in bill', text: 'Thu tiền tại quầy, in bill tạm tính và bill đã thanh toán khổ 80 mm.' },
  { title: 'Bếp, kho và báo cáo', text: 'Theo dõi món tại bếp, quản lý kho và xem báo cáo theo gói bạn chọn.' },
]

const STEPS = [
  { title: 'Đăng ký nhà hàng', text: 'Tạo tài khoản chủ quán trong vài phút.' },
  { title: 'Chọn gói', text: 'Chọn gói phù hợp với quy mô và nhu cầu.' },
  { title: 'Bắt đầu bán hàng', text: 'Thiết lập thực đơn, bàn và nhân viên để vận hành.' },
]

const FAQS = [
  { question: 'Có cần cài đặt phần mềm không?', answer: 'Không. Bạn chỉ cần trình duyệt và kết nối mạng để đăng nhập và sử dụng.' },
  { question: 'Nhân viên có dùng chung một tài khoản không?', answer: 'Không. Mỗi nhân viên có tài khoản và quyền riêng, trong giới hạn nhân viên của gói.' },
  { question: 'Giá gói được chốt khi nào?', answer: 'Giá được chốt khi bạn xác nhận đơn mua gói và được giữ trong 15 phút.' },
  { question: 'Thanh toán gói bằng cách nào?', answer: 'Chuyển khoản ngân hàng bằng mã VietQR hiển thị sau khi bạn xác nhận gói. Giữ nguyên nội dung chuyển khoản để hệ thống nhận diện.' },
]

export function LandingPage() {
  const status = useAuthStore((state) => state.status)
  const bootstrap = useAuthStore((state) => state.bootstrap)
  const authenticated = status === 'authenticated'

  // Restores the session for the header CTA without blocking the page.
  useEffect(() => {
    if (useAuthStore.getState().status === 'bootstrapping') void bootstrap()
  }, [bootstrap])

  return (
    <div className="brand-scope landing-page">
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link className="brand-logo" to="/">
            <BrandMark className="brand-logo-mark" />
            {env.appName}
          </Link>
          <nav className="landing-nav" aria-label="Điều hướng trang">
            <a href="#tinh-nang">Tính năng</a>
            <a href="#bang-gia">Bảng giá</a>
            <a href="#hoi-dap">Hỏi đáp</a>
          </nav>
          <div className="landing-header-actions">
            {authenticated ? (
              <Link className="brand-button brand-button-primary" to="/app">Vào ứng dụng</Link>
            ) : (
              <>
                <Link className="brand-button brand-button-ghost" to="/login">Đăng nhập</Link>
                <Link className="brand-button brand-button-primary" to="/register">Đăng ký</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-container landing-hero-inner">
            <div>
              <h1>Quản lý nhà hàng gọn gàng, từ gọi món đến thu tiền.</h1>
              <p>Một nền tảng cho quầy thu ngân, nhân viên phục vụ và bếp, giúp mọi đơn hàng rõ ràng trong suốt ca làm.</p>
              <div className="landing-hero-actions">
                <Link className="brand-button brand-button-primary brand-button-large" to={authenticated ? '/app' : '/register'}>
                  {authenticated ? 'Vào ứng dụng' : 'Đăng ký nhà hàng'}
                </Link>
                <a className="brand-button brand-button-ghost brand-button-large" href="#bang-gia">Xem bảng giá</a>
              </div>
            </div>
            <PosPreview />
          </div>
        </section>

        <div className="landing-container">
          <section className="landing-section" id="tinh-nang">
            <div className="landing-section-head">
              <h2>Đủ cho một ca làm việc</h2>
              <p>Những việc nhà hàng làm mỗi ngày, gom về một chỗ.</p>
            </div>
            <div className="landing-benefits">
              {BENEFITS.map((benefit) => (
                <article key={benefit.title}>
                  <h3>{benefit.title}</h3>
                  <p>{benefit.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="landing-section">
            <div className="landing-section-head">
              <h2>Bắt đầu trong 3 bước</h2>
            </div>
            <ol className="landing-steps">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <span>{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </section>

          <PricingSection authenticated={authenticated} />

          <section className="landing-section landing-faq" id="hoi-dap">
            <div className="landing-section-head">
              <h2>Câu hỏi thường gặp</h2>
            </div>
            {FAQS.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </section>
        </div>

        <section className="landing-cta">
          <div className="landing-container">
            <h2>Sẵn sàng thử với nhà hàng của bạn?</h2>
            <Link className="brand-button brand-button-primary brand-button-large" to={authenticated ? '/app' : '/register'}>
              {authenticated ? 'Vào ứng dụng' : 'Đăng ký nhà hàng'}
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <span>© {new Date().getFullYear()} {env.appName}</span>
          <address className="landing-contact" aria-label="Thông tin liên hệ">
            <span className="landing-contact-label">Liên hệ</span>
            <a href={`tel:${CONTACT.phone}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></svg>
              {CONTACT.phoneDisplay}
            </a>
            <a href={CONTACT.facebook} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.87.25-1.46 1.5-1.46h1.6V4.46A21 21 0 0 0 14.3 4.3c-2.3 0-3.8 1.4-3.8 3.95v2.25H8v3h2.5V21z" /></svg>
              Facebook
            </a>
          </address>
        </div>
      </footer>
    </div>
  )
}
