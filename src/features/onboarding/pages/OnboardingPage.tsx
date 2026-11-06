import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, useLocation } from 'react-router-dom'
import { refreshWithCoordinator } from '../../../shared/api/httpClient'
import { StatusPage } from '../../../shared/components/StatusPage'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import { onboardingApi } from '../api/onboardingApi'
import { onboardingKeys } from '../api/onboardingKeys'
import { OnboardingLayout } from '../components/OnboardingLayout'
import { OnboardingNotice } from '../components/OnboardingNotice'
import { OpenAppButton } from '../components/OpenAppButton'
import { PackageStep } from '../components/PackageStep'
import { PurchaseHistory } from '../components/PurchaseHistory'
import { RestaurantStep } from '../components/RestaurantStep'
import { resolveOnboardingView } from '../utils/resolveOnboardingView'

export function OnboardingPage() {
  const status = useQuery({
    queryKey: onboardingKeys.status,
    queryFn: ({ signal }) => onboardingApi.status(signal),
    staleTime: 0,
  })
  const profile = useQuery({ queryKey: onboardingKeys.restaurant, queryFn: ({ signal }) => onboardingApi.restaurant(signal) })
  const location = useLocation()
  const [stepChoice, setStepChoice] = useState<'restaurant' | 'package' | null>(() =>
    (location.state as { step?: string } | null)?.step === 'package' ? 'package' : null,
  )

  const refreshPermissions = async () => {
    await refreshWithCoordinator().catch(() => undefined)
    await status.refetch()
  }

  // A cached status may still name a purchase that was just cancelled; never route from it.
  if (!status.isFetchedAfterMount) return <StatusPage kind="loading" title="Đang tải thông tin nhà hàng" />

  if (status.isError) {
    const error = normalizeApiError(status.error)
    if (error.code === 'FORBIDDEN') return <PermissionNotice onRefresh={refreshPermissions} />
    return (
      <OnboardingLayout step={1}>
        <OnboardingNotice title="Chưa tải được thông tin">
          <p>{error.message}</p>
          <button className="brand-button brand-button-primary" type="button" onClick={() => void status.refetch()}>Thử lại</button>
        </OnboardingNotice>
      </OnboardingLayout>
    )
  }

  if (!status.data) return <StatusPage kind="loading" title="Đang tải thông tin nhà hàng" />
  const view = resolveOnboardingView(status.data)

  if (view.kind === 'open-purchase') return <Navigate to={`/onboarding/purchases/${view.purchaseId}`} replace />
  if (view.kind === 'refresh-permission') return <PermissionNotice onRefresh={refreshPermissions} />

  if (view.kind === 'active')
    return (
      <OnboardingLayout step={2}>
        <OnboardingNotice title="Nhà hàng đã có gói hoạt động">
          <p>Bạn có thể bắt đầu sử dụng POS ngay.</p>
          {view.hasPaymentReview && <div className="brand-alert">Có giao dịch đang chờ đội hỗ trợ kiểm tra. Việc này không ảnh hưởng đến gói đang dùng.</div>}
          <OpenAppButton />
        </OnboardingNotice>
      </OnboardingLayout>
    )

  if (view.kind === 'pending-subscription')
    return (
      <OnboardingLayout step={2}>
        <OnboardingNotice title="Gói đang chờ kích hoạt">
          <p>Quản trị viên đã gán gói cho nhà hàng. Gói sẽ dùng được sau khi quản trị viên kích hoạt.</p>
          <button className="brand-button brand-button-ghost" type="button" onClick={() => void status.refetch()}>Kiểm tra lại</button>
        </OnboardingNotice>
      </OnboardingLayout>
    )

  if (view.kind === 'blocked')
    return (
      <OnboardingLayout step={1}>
        <OnboardingNotice title="Chưa thể mua gói">
          <p>Nhà hàng chưa đủ điều kiện mua gói mới. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.</p>
          <button className="brand-button brand-button-ghost" type="button" onClick={() => void status.refetch()}>Kiểm tra lại</button>
        </OnboardingNotice>
      </OnboardingLayout>
    )

  // Wait for the profile so the choice below does not flip from "restaurant" to "package" mid-render.
  if (profile.isPending) return <StatusPage kind="loading" title="Đang tải thông tin nhà hàng" />
  const profileFilled = Boolean(profile.data?.phone || profile.data?.address)
  const step = stepChoice ?? (profileFilled || !profile.data ? 'package' : 'restaurant')

  if (step === 'restaurant' && profile.data)
    return (
      <OnboardingLayout step={0}>
        <RestaurantStep profile={profile.data} onDone={() => setStepChoice('package')} />
      </OnboardingLayout>
    )

  return (
    <OnboardingLayout step={1}>
      <PackageStep canPurchase={view.kind === 'select'} expiredPurchase={view.expiredPurchase} onBack={() => setStepChoice('restaurant')} />
      <PurchaseHistory />
    </OnboardingLayout>
  )
}

function PermissionNotice({ onRefresh }: { onRefresh: () => Promise<void> }) {
  return (
    <OnboardingLayout step={1}>
      <OnboardingNotice title="Cần làm mới phiên đăng nhập">
        <p>Tài khoản vừa được cập nhật quyền. Làm mới phiên để tiếp tục.</p>
        <button className="brand-button brand-button-primary" type="button" onClick={() => void onRefresh()}>Làm mới phiên</button>
      </OnboardingNotice>
    </OnboardingLayout>
  )
}
