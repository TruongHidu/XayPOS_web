import type { ReactNode } from 'react'
import { formatVnd } from '../../../shared/utils/adminFormatting'
import { billingPeriodLabel, buildPackageCards, staffLimitLabel } from '../utils/packagePresentation'
import type { CatalogPackage } from '../schemas'
import '../../../shared/styles/brand.css'
import '../onboarding.css'

interface PackageCardsProps {
  packages: CatalogPackage[]
  selectedCode?: string | null
  renderAction?: (plan: CatalogPackage) => ReactNode
}

export function PackageCards({ packages, selectedCode, renderAction }: PackageCardsProps) {
  return (
    <div className="package-grid">
      {buildPackageCards(packages).map(({ plan, includesPlanName, items, hiddenCount }) => (
        <article key={plan.code} className={`package-card ${plan.code === selectedCode ? 'is-selected' : ''}`}>
          <h3>{plan.name}</h3>
          {plan.description && <p className="package-description">{plan.description}</p>}
          <p className="package-price">
            <strong>{formatVnd(plan.priceAmount)}</strong>
            <span>/{billingPeriodLabel(plan.billingCycleMonths)}</span>
          </p>
          <ul className="brand-check-list">
            <li>{staffLimitLabel(plan.maxStaff)}</li>
            {includesPlanName && <li>Tất cả chức năng của gói {includesPlanName}</li>}
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
            {hiddenCount > 0 && <li>Và {hiddenCount} chức năng khác</li>}
          </ul>
          {renderAction && <div className="package-action">{renderAction(plan)}</div>}
        </article>
      ))}
    </div>
  )
}
