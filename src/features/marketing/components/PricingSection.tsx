import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { onboardingApi } from '../../onboarding/api/onboardingApi'
import { onboardingKeys } from '../../onboarding/api/onboardingKeys'
import { PackageCards } from '../../onboarding/components/PackageCards'

export function PricingSection({ authenticated }: { authenticated: boolean }) {
  const packages = useQuery({ queryKey: onboardingKeys.packages, queryFn: ({ signal }) => onboardingApi.packages(signal) })

  return (
    <section className="landing-section" id="bang-gia">
      <div className="landing-section-head">
        <h2>Bảng giá</h2>
        <p>Chọn gói theo quy mô nhà hàng.</p>
      </div>
      {packages.isPending && <p className="landing-pricing-state">Đang tải bảng giá…</p>}
      {packages.isError && (
        <div className="landing-pricing-state" role="alert">
          <p>Chưa tải được bảng giá.</p>
          <button className="brand-button brand-button-ghost" type="button" onClick={() => void packages.refetch()}>Thử lại</button>
        </div>
      )}
      {packages.data?.length === 0 && <p className="landing-pricing-state">Bảng giá đang được cập nhật.</p>}
      {packages.data && packages.data.length > 0 && (
        <PackageCards
          packages={packages.data}
          renderAction={(plan) =>
            authenticated ? (
              <Link className="brand-button brand-button-ghost brand-button-block" to="/app">Vào ứng dụng</Link>
            ) : (
              <Link className="brand-button brand-button-ghost brand-button-block" to={`/register?package=${encodeURIComponent(plan.code)}`}>Chọn gói {plan.name}</Link>
            )
          }
        />
      )}
    </section>
  )
}
