import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '../../auth/store/authStore'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import { onboardingApi } from '../api/onboardingApi'
import { attemptKeyFor, clearAttemptKey } from '../utils/purchaseIntent'
import { PaymentInstructions } from './PaymentInstructions'
import type { CurrentAttempt, PurchaseView } from '../schemas'

/** The server has answered for this key; a further click is a new payment intent. */
const SETTLED_ERRORS = new Set(['PAYMENT_ATTEMPT_PENDING', 'PAYMENT_ATTEMPT_NOT_ALLOWED', 'PURCHASE_PERIOD_EXPIRED', 'PURCHASE_REVIEW_REQUIRED'])

interface PaymentSectionProps {
  purchase: PurchaseView
  current: CurrentAttempt | undefined
  attemptFailed: boolean
  countdown: ReactNode
  /** Create the QR once on arrival from package selection, without waiting for a click. */
  autoCreate?: boolean
  onChanged: () => Promise<unknown>
}

export function PaymentSection({ purchase, current, attemptFailed, countdown, autoCreate = false, onChanged }: PaymentSectionProps) {
  const user = useAuthStore((state) => state.user)
  const [message, setMessage] = useState<string | null>(null)
  const scope = { restaurantId: user?.restaurantId ?? '', userId: user?.id ?? '' }
  const attempt = current?.paymentAttempt ?? null
  const canCreate = purchase.allowedActions.includes('CREATE_PAYMENT_ATTEMPT')

  const create = useMutation({
    mutationFn: () => onboardingApi.createAttempt(purchase.id, attemptKeyFor(scope, purchase.id)),
    // A replayed POST returns the body from creation time, so the screen always reloads from GET.
    // Returning the reload keeps the mutation pending until the QR is on screen.
    onSuccess: () => {
      clearAttemptKey(scope, purchase.id)
      return onChanged()
    },
    onError: (error) => {
      const normalized = normalizeApiError(error)
      if (SETTLED_ERRORS.has(normalized.code)) clearAttemptKey(scope, purchase.id)
      void onChanged()
      if (normalized.code === 'PAYMENT_ATTEMPT_PENDING') return
      const uncertain =
        normalized.isNetworkError ||
        ((normalized.status ?? 0) >= 500 && normalized.code !== 'PAYMENT_PROVIDER_UNAVAILABLE' && normalized.code !== 'PURCHASE_UNAVAILABLE')
      setMessage(uncertain ? 'Chưa rõ mã QR đã được tạo hay chưa. Bấm lại, hệ thống sẽ không tạo trùng.' : normalized.message)
    },
  })

  // Only a purchase that never had an attempt is created automatically; an ended one needs the owner to confirm.
  const autoReady = autoCreate && canCreate && current !== undefined && current.paymentAttempt === null
  const autoStarted = useRef(false)
  const { mutate } = create
  useEffect(() => {
    if (!autoReady || autoStarted.current) return
    autoStarted.current = true
    mutate()
  }, [autoReady, mutate])

  const awaitingAuto = autoCreate && canCreate && create.isIdle && !attemptFailed && (current === undefined || current.paymentAttempt === null)
  const preparing = create.isPending || awaitingAuto
  if (preparing && attempt?.displayStatus !== 'PENDING')
    return (
      <>
        <h1>Đang tạo mã QR thanh toán</h1>
        <p role="status">Vui lòng đợi trong giây lát, mã VietQR sẽ hiển thị ngay sau đây.</p>
        {countdown}
      </>
    )

  if (attempt?.displayStatus === 'PENDING')
    return (
      <>
        <h1>Quét mã để thanh toán</h1>
        <p>Chuyển khoản đúng số tiền và giữ nguyên nội dung để hệ thống tự nhận diện.</p>
        <PaymentInstructions attempt={attempt} />
        {countdown}
        <p className="payment-waiting" role="status">
          Sau khi chuyển khoản, trang sẽ tự cập nhật khi hệ thống ghi nhận thanh toán.
        </p>
        <button className="brand-button brand-button-ghost" type="button" onClick={() => void onChanged()}>Tôi đã chuyển khoản</button>
      </>
    )

  if (attempt?.displayStatus === 'SUCCESS')
    return (
      <>
        <h1>Đã nhận tiền, đang xử lý</h1>
        <p>Bạn không cần chuyển khoản lại. Trang sẽ tự cập nhật khi gói được kích hoạt.</p>
      </>
    )

  const previousEnded = attempt !== null
  return (
    <>
      <h1>{canCreate ? 'Thanh toán bằng chuyển khoản' : 'Thanh toán online chưa mở'}</h1>
      {message && <div className="brand-alert brand-alert-error" role="alert">{message}</div>}
      {attemptFailed && <div className="brand-alert brand-alert-error" role="alert">Chưa tải được thông tin thanh toán. Hãy tải lại trang.</div>}
      {previousEnded && <div className="brand-alert">Mã QR trước đó không còn hiệu lực. Không chuyển khoản theo mã cũ.</div>}
      <p>
        {canCreate
          ? 'Tạo mã VietQR để chuyển khoản. Mã có hiệu lực đến hết thời gian giữ giá.'
          : 'Đơn của bạn đã được ghi nhận và giữ giá trong thời gian bên dưới. Hiện chưa thể thanh toán online, bạn chưa cần chuyển tiền.'}
      </p>
      {countdown}
      {canCreate && (
        <div className="onboarding-actions">
          <button
            className="brand-button brand-button-primary brand-button-large"
            type="button"
            disabled={!current}
            onClick={() => {
              setMessage(null)
              create.mutate()
            }}
          >
            {previousEnded ? 'Tạo mã QR mới' : 'Tạo mã QR thanh toán'}
          </button>
        </div>
      )}
    </>
  )
}
