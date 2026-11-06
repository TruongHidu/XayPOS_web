import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { onboardingApi } from '../api/onboardingApi'
import { onboardingKeys } from '../api/onboardingKeys'
import { purchaseStatusLabel } from '../utils/packagePresentation'
import { formatDateTimeVi, formatVnd } from '../../../shared/utils/adminFormatting'

export function PurchaseHistory() {
  const history = useQuery({ queryKey: onboardingKeys.purchases, queryFn: ({ signal }) => onboardingApi.purchases(signal) })
  if (!history.data?.content.length) return null

  return (
    <section className="onboarding-history">
      <h2>Đơn mua gói gần đây</h2>
      <ul>
        {history.data.content.map((purchase) => (
          <li key={purchase.id}>
            <Link to={`/onboarding/purchases/${purchase.id}`}>
              <span>
                <strong>{purchase.quote.packageName}</strong> · {formatVnd(purchase.quote.priceAmount)}
                <small>{formatDateTimeVi(purchase.createdAt)}</small>
              </span>
              <span className="onboarding-history-status">{purchaseStatusLabel(purchase.displayStatus)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
