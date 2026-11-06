import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../auth/store/authStore'
import { onboardingApi } from '../api/onboardingApi'
import { onboardingKeys } from '../api/onboardingKeys'
import { PackageCards } from './PackageCards'
import { clearPurchaseIntent, purchaseIntentFor } from '../utils/purchaseIntent'
import { packageSelection } from '../utils/packageSelection'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'

const RESOLVED_BY_ONBOARDING = new Set([
  'PURCHASE_IN_PROGRESS',
  'PURCHASE_REVIEW_REQUIRED',
  'PURCHASE_UNAVAILABLE',
  'SUBSCRIPTION_ALREADY_ACTIVE',
  'SUBSCRIPTION_PENDING_EXISTS',
])

interface PackageStepProps {
  canPurchase: boolean
  expiredPurchase: boolean
  onBack: () => void
}

export function PackageStep({ canPurchase, expiredPurchase, onBack }: PackageStepProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [selectedCode, setSelectedCode] = useState(() => packageSelection.read())
  const [message, setMessage] = useState<string | null>(null)
  const packages = useQuery({ queryKey: onboardingKeys.packages, queryFn: ({ signal }) => onboardingApi.packages(signal) })
  const scope = { restaurantId: user?.restaurantId ?? '', userId: user?.id ?? '' }
  const selected = packages.data?.find((item) => item.code === selectedCode) ?? null

  const create = useMutation({
    mutationFn: (packageCode: string) => onboardingApi.createPurchase(packageCode, purchaseIntentFor(scope, packageCode).key),
    onSuccess: (purchase) => {
      clearPurchaseIntent(scope)
      packageSelection.clear()
      // The POST body of a replay can be stale, so the next page must load from GET detail.
      queryClient.removeQueries({ queryKey: onboardingKeys.purchase(purchase.id) })
      queryClient.removeQueries({ queryKey: onboardingKeys.status })
      void queryClient.invalidateQueries({ queryKey: onboardingKeys.purchases })
      navigate(`/onboarding/purchases/${purchase.id}`, { state: { autoPay: true } })
    },
    onError: (error) => {
      const normalized = normalizeApiError(error)
      if (RESOLVED_BY_ONBOARDING.has(normalized.code)) {
        clearPurchaseIntent(scope)
        void queryClient.invalidateQueries({ queryKey: onboardingKeys.status })
        return
      }
      if (normalized.code === 'PACKAGE_NOT_FOUND' || normalized.code === 'PACKAGE_NOT_PURCHASABLE') {
        clearPurchaseIntent(scope)
        setSelectedCode(null)
        void queryClient.invalidateQueries({ queryKey: onboardingKeys.packages })
      }
      if (normalized.code === 'IDEMPOTENCY_KEY_REUSED') void queryClient.invalidateQueries({ queryKey: onboardingKeys.status })
      setMessage(
        normalized.isNetworkError || (normalized.status ?? 0) >= 500
          ? 'Chưa rõ yêu cầu đã được ghi nhận hay chưa. Bấm xác nhận lại, hệ thống sẽ không tạo trùng.'
          : normalized.message,
      )
    },
  })

  return (
    <section className="onboarding-section">
      <h1>Chọn gói cho nhà hàng</h1>
      <p className="onboarding-lead">Giá chính thức được chốt ở bước tiếp theo.</p>
      {expiredPurchase && <div className="brand-alert">Đơn mua gói trước đã hết hạn. Hãy chọn lại gói để tiếp tục.</div>}
      {!canPurchase && <div className="brand-alert">Hệ thống đang tạm ngưng nhận đơn mua gói mới. Bạn vẫn có thể xem các gói bên dưới.</div>}
      {message && <div className="brand-alert brand-alert-error" role="alert">{message}</div>}

      {packages.isPending && <p className="onboarding-lead">Đang tải các gói…</p>}
      {packages.isError && (
        <div className="brand-alert brand-alert-error" role="alert">
          Chưa tải được danh sách gói.{' '}
          <button className="onboarding-link-button" type="button" onClick={() => void packages.refetch()}>Thử lại</button>
        </div>
      )}
      {packages.data && (
        <PackageCards
          packages={packages.data}
          selectedCode={selectedCode}
          renderAction={
            canPurchase
              ? (plan) => (
                  <button
                    className={`brand-button brand-button-block ${plan.code === selectedCode ? 'brand-button-primary' : 'brand-button-ghost'}`}
                    type="button"
                    aria-pressed={plan.code === selectedCode}
                    disabled={create.isPending}
                    onClick={() => {
                      setMessage(null)
                      setSelectedCode(plan.code)
                    }}
                  >
                    {plan.code === selectedCode ? 'Đã chọn' : `Chọn gói ${plan.name}`}
                  </button>
                )
              : undefined
          }
        />
      )}

      <div className="onboarding-actions onboarding-sticky-actions">
        <button className="brand-button brand-button-ghost" type="button" onClick={onBack}>Quay lại</button>
        {canPurchase && (
          <button
            className="brand-button brand-button-primary"
            type="button"
            disabled={!selected || create.isPending}
            onClick={() => {
              if (!selected) return
              setMessage(null)
              create.mutate(selected.code)
            }}
          >
            {create.isPending ? 'Đang tạo đơn…' : selected ? `Xác nhận gói ${selected.name}` : 'Chọn một gói để tiếp tục'}
          </button>
        )}
      </div>
    </section>
  )
}
