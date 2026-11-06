import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { StatusPage } from '../../../shared/components/StatusPage'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import { formatDateTimeVi, formatVnd } from '../../../shared/utils/adminFormatting'
import { onboardingApi } from '../api/onboardingApi'
import { onboardingKeys } from '../api/onboardingKeys'
import { OnboardingLayout } from '../components/OnboardingLayout'
import { OnboardingNotice } from '../components/OnboardingNotice'
import { OpenAppButton } from '../components/OpenAppButton'
import { PaymentSection } from '../components/PaymentSection'
import { formatCountdown, useServerCountdown } from '../hooks/useServerCountdown'
import { billingPeriodLabel, featureLabels, purchaseStatusLabel, staffLimitLabel } from '../utils/packagePresentation'
import { purchasePollDelay } from '../utils/purchasePolling'
import type { PurchaseView } from '../schemas'

function Countdown({ expiresAt, serverTime, onElapsed }: { expiresAt: string; serverTime: string; onElapsed: () => void }) {
  const left = useServerCountdown(expiresAt, serverTime, onElapsed)
  return <strong className="purchase-countdown">{formatCountdown(left)}</strong>
}

function PurchaseSummary({ purchase }: { purchase: PurchaseView }) {
  const { quote } = purchase
  const features = featureLabels(quote.features)
  return (
    <aside className="onboarding-card purchase-summary">
      <span className="purchase-status">{purchaseStatusLabel(purchase.displayStatus)}</span>
      <h2>Gói {quote.packageName}</h2>
      <p className="package-price">
        <strong>{formatVnd(quote.priceAmount)}</strong>
        <span>/{billingPeriodLabel(quote.billingCycleMonths)}</span>
      </p>
      <ul className="brand-check-list">
        <li>{staffLimitLabel(quote.maxStaff)}</li>
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <p className="purchase-meta">Mã đơn: {purchase.id}</p>
    </aside>
  )
}

function ChooseAgainLink() {
  return <Link className="brand-button brand-button-primary" to="/onboarding" state={{ step: 'package' }}>Chọn gói lại</Link>
}

export function PurchasePage() {
  const { purchaseId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Set only when arriving straight from package selection; reload and back must not create another QR.
  const [autoPay] = useState(() => (location.state as { autoPay?: boolean } | null)?.autoPay === true)
  useEffect(() => {
    if (autoPay) navigate(location.pathname, { replace: true, state: null })
    // Runs once: the flag already lives in component state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const attemptQuery = useQuery({
    queryKey: onboardingKeys.attempt(purchaseId),
    queryFn: ({ signal }) => onboardingApi.currentAttempt(purchaseId, signal),
    staleTime: 0,
  })
  const attemptPending = attemptQuery.data?.paymentAttempt?.displayStatus === 'PENDING'
  // Polling pauses while the tab is hidden and resumes with a refetch on focus (React Query defaults).
  const query = useQuery({
    queryKey: onboardingKeys.purchase(purchaseId),
    queryFn: ({ signal }) => onboardingApi.purchase(purchaseId, signal),
    staleTime: 0,
    refetchInterval: (current) => purchasePollDelay(current.state.data, attemptPending, current.state.error !== null),
  })

  // Settlement, expiry and cancel all move the purchase; reload the attempt whenever that happens.
  const purchaseState = query.data ? `${query.data.version}:${query.data.displayStatus}` : null
  const seenPurchaseState = useRef<string | null>(null)
  const refetchAttempt = attemptQuery.refetch
  useEffect(() => {
    if (purchaseState === null) return
    if (seenPurchaseState.current !== null && seenPurchaseState.current !== purchaseState) void refetchAttempt()
    seenPurchaseState.current = purchaseState
  }, [purchaseState, refetchAttempt])

  const reloadPayment = () => Promise.all([query.refetch(), attemptQuery.refetch()])

  const cancel = useMutation({
    mutationFn: (expectedVersion: number) => onboardingApi.cancelPurchase(purchaseId, expectedVersion),
    onSuccess: (purchase) => {
      queryClient.setQueryData(onboardingKeys.purchase(purchaseId), purchase)
      queryClient.removeQueries({ queryKey: onboardingKeys.status })
      void queryClient.invalidateQueries({ queryKey: onboardingKeys.purchases, exact: true })
    },
    onError: (error) => {
      // A failed or timed-out cancel says nothing about the current state, so reload before acting again.
      const normalized = normalizeApiError(error)
      setMessage(normalized.code === 'CONCURRENT_SUBSCRIPTION_UPDATE' ? 'Đơn vừa có thay đổi. Dữ liệu đã được tải lại, vui lòng kiểm tra trước khi thử lại.' : normalized.message)
      void query.refetch()
    },
    onSettled: () => setConfirming(false),
  })

  if (query.isPending) return <StatusPage kind="loading" title="Đang tải đơn mua gói" />

  if (query.isError) {
    const error = normalizeApiError(query.error)
    return (
      <OnboardingLayout step={2}>
        <OnboardingNotice title={error.code === 'PURCHASE_NOT_FOUND' ? 'Không tìm thấy đơn mua gói' : 'Chưa tải được đơn mua gói'}>
          <p>{error.message}</p>
          <div className="onboarding-actions">
            <Link className="brand-button brand-button-ghost" to="/onboarding">Về trang chọn gói</Link>
            {error.code !== 'PURCHASE_NOT_FOUND' && <button className="brand-button brand-button-primary" type="button" onClick={() => void query.refetch()}>Thử lại</button>}
          </div>
        </OnboardingNotice>
      </OnboardingLayout>
    )
  }

  const purchase = query.data
  const status = purchase.displayStatus
  const canCancel = status === 'PENDING_PAYMENT' && purchase.allowedActions.includes('CANCEL_PURCHASE')

  return (
    <OnboardingLayout step={2}>
      <div className="purchase-layout">
        <section className="onboarding-card purchase-main">
          {message && <div className="brand-alert brand-alert-error" role="alert">{message}</div>}

          {status === 'PENDING_PAYMENT' && (
            <PaymentSection
              purchase={purchase}
              current={attemptQuery.data}
              attemptFailed={attemptQuery.isError}
              autoCreate={autoPay}
              onChanged={reloadPayment}
              countdown={
                <p className="purchase-deadline">
                  {attemptPending ? 'Mã QR hết hạn sau' : 'Giữ giá còn'}{' '}
                  <Countdown
                    key={`${purchase.quote.expiresAt}:${purchase.serverTime}`}
                    expiresAt={purchase.quote.expiresAt}
                    serverTime={purchase.serverTime}
                    onElapsed={() => void reloadPayment()}
                  />
                </p>
              }
            />
          )}
          {status === 'EXPIRED' && (
            <>
              <h1>Đơn đã hết hạn</h1>
              <p>Thời gian giữ giá đã kết thúc. Không cần thanh toán cho đơn này.</p>
              <ChooseAgainLink />
            </>
          )}
          {status === 'CANCELLED' && (
            <>
              <h1>Đơn đã được hủy</h1>
              <p>Hủy lúc {formatDateTimeVi(purchase.cancelledAt)}. Bạn có thể tạo đơn mới bất cứ lúc nào.</p>
              <ChooseAgainLink />
            </>
          )}
          {status === 'PAID' && (
            <>
              <h1>Đã nhận tiền, đang kích hoạt</h1>
              <p>Bạn không cần thanh toán lại. Gói sẽ sẵn sàng sau khi hệ thống kích hoạt xong.</p>
            </>
          )}
          {status === 'ACTIVATED' && (
            <>
              <h1>Gói đã được kích hoạt</h1>
              <p>Nhà hàng của bạn đã sẵn sàng sử dụng POS.</p>
              <OpenAppButton />
            </>
          )}
          {(status === 'REVIEW_REQUIRED' || status === 'CLOSED') && (
            <>
              <h1>{status === 'CLOSED' ? 'Đơn đã được đóng' : 'Đơn đang được kiểm tra'}</h1>
              <p>Vui lòng liên hệ đội hỗ trợ và cung cấp mã đơn để được xử lý. Không chuyển khoản thêm cho đơn này.</p>
            </>
          )}

          {canCancel && !confirming && (
            <div className="onboarding-actions">
              <button className="brand-button brand-button-danger" type="button" onClick={() => setConfirming(true)}>Hủy đơn</button>
            </div>
          )}
          {canCancel && confirming && (
            <div className="purchase-confirm" role="group" aria-label="Xác nhận hủy đơn">
              <p>Hủy đơn gói {purchase.quote.packageName}?</p>
              {attemptPending && <p className="purchase-confirm-note">Chỉ hủy nếu bạn chưa chuyển khoản. Nếu đã chuyển, hãy chờ hệ thống xác nhận.</p>}
              <div className="onboarding-actions">
                <button className="brand-button brand-button-ghost" type="button" disabled={cancel.isPending} onClick={() => setConfirming(false)}>Giữ đơn</button>
                <button
                  className="brand-button brand-button-danger"
                  type="button"
                  disabled={cancel.isPending || query.isFetching}
                  onClick={() => {
                    setMessage(null)
                    cancel.mutate(purchase.version)
                  }}
                >
                  {cancel.isPending ? 'Đang hủy…' : 'Xác nhận hủy'}
                </button>
              </div>
            </div>
          )}
        </section>
        <PurchaseSummary purchase={purchase} />
      </div>
    </OnboardingLayout>
  )
}
