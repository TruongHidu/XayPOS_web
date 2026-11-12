import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { adminKeys } from '../api/adminKeys'
import { adminPaymentEventsApi } from '../api/adminPaymentsApi'
import { retryAdminQuery } from '../api/queryPolicy'
import { useAuthStore } from '../../auth/store/authStore'
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader, Pagination, Toast } from '../../../shared/components/AdminUi'
import type { PaymentEventCriteria, PaymentEventState, PaymentReviewReason } from '../../../shared/types/adminPayments'
import { PaymentEventCard } from '../components/PaymentEventCard'
import { reviewReasonInfo } from '../utils/paymentLabels'
import '../admin-payments.css'

const views: Array<{ state: PaymentEventState | ''; label: string }> = [
  { state: 'REVIEW_REQUIRED', label: 'Cần xử lý' },
  { state: 'CLOSED', label: 'Đã đóng' },
  { state: 'PROCESSED', label: 'Đã đối soát' },
  { state: '', label: 'Tất cả' },
]
const reasons = Object.keys(reviewReasonInfo) as PaymentReviewReason[]

export function PaymentReviewPage() {
  const canReview = Boolean(useAuthStore((state) => state.user?.permissions.includes('SUBSCRIPTION_PAYMENT_REVIEW')))
  const [searchParams, setSearchParams] = useSearchParams()
  const criteria = readCriteria(searchParams)
  const [search, setSearch] = useState(criteria.q)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchParams((current) => {
        if ((current.get('q') ?? '') === search.trim()) return current
        if (search.trim()) current.set('q', search.trim())
        else current.delete('q')
        current.delete('page')
        return current
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [search, setSearchParams])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const query = useQuery({
    queryKey: adminKeys.paymentEvents(criteria),
    queryFn: () => adminPaymentEventsApi.list(criteria),
    enabled: canReview,
    retry: retryAdminQuery,
  })
  const update = (changes: Partial<PaymentEventCriteria>) =>
    setSearchParams((current) => {
      const next = { ...criteria, ...changes }
      setParam(current, 'state', next.state === 'REVIEW_REQUIRED' ? '' : next.state || 'ALL')
      setParam(current, 'reviewReason', next.reviewReason)
      setParam(current, 'page', next.page ? String(next.page) : '')
      return current
    })

  const header = (
    <PageHeader
      eyebrow="Thanh toán"
      title="Đối soát chuyển khoản"
      description="Các khoản chuyển khoản mua gói mà hệ thống không tự khớp được với đơn. Xác nhận, xử lý lại hoặc đóng từng giao dịch; mọi quyết định đều được ghi vào nhật ký."
    />
  )
  if (!canReview)
    return (
      <>
        {header}
        <section className="card access-card">
          <EmptyState title="Chưa có quyền đối soát" description="Cần quyền SUBSCRIPTION_PAYMENT_REVIEW để xem và xử lý giao dịch." />
        </section>
      </>
    )

  const data = query.data
  return (
    <>
      {header}
      {toast && <Toast message={toast} />}
      <section className="card table-card">
        <div className="toolbar filter-toolbar">
          <div className="filter-tabs" role="group" aria-label="Lọc theo trạng thái">
            {views.map((view) => (
              <button
                key={view.label}
                type="button"
                className={criteria.state === view.state ? 'selected' : ''}
                aria-pressed={criteria.state === view.state}
                onClick={() => update({ state: view.state, page: 0 })}
              >
                {view.label}
              </button>
            ))}
          </div>
          <select
            aria-label="Lọc theo lý do"
            value={criteria.reviewReason}
            onChange={(event) => update({ reviewReason: event.target.value as PaymentReviewReason | '', page: 0 })}
          >
            <option value="">Mọi lý do</option>
            {reasons.map((reason) => (
              <option key={reason} value={reason}>
                {reviewReasonInfo[reason].label}
              </option>
            ))}
          </select>
          <label className="search-field">
            <span className="sr-only">Tìm giao dịch</span>
            <input
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm nội dung CK, mã giao dịch, nhà hàng…"
            />
          </label>
        </div>
        {query.isLoading ? (
          <LoadingSkeleton rows={5} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !data || data.content.length === 0 ? (
          <EmptyState
            title={criteria.state === 'REVIEW_REQUIRED' ? 'Không còn giao dịch cần xử lý' : 'Không có giao dịch'}
            description={criteria.state === 'REVIEW_REQUIRED' ? 'Mọi chuyển khoản đã được đối soát.' : 'Không có giao dịch phù hợp bộ lọc.'}
          />
        ) : (
          <>
            <div className="payment-event-list">
              {data.content.map((event) => (
                <PaymentEventCard key={event.id} event={event} canReview={canReview} onDone={setToast} />
              ))}
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} onPageChange={(page) => update({ page })} />
          </>
        )}
      </section>
    </>
  )
}

function readCriteria(params: URLSearchParams): PaymentEventCriteria {
  const rawState = params.get('state')
  const state: PaymentEventState | '' =
    rawState === 'ALL' ? '' : rawState && views.some((v) => v.state === rawState) ? (rawState as PaymentEventState) : 'REVIEW_REQUIRED'
  const reason = params.get('reviewReason') as PaymentReviewReason | null
  return {
    state,
    reviewReason: reason && reasons.includes(reason) ? reason : '',
    q: params.get('q') ?? '',
    page: Math.max(0, Number(params.get('page') ?? 0) || 0),
    size: 20,
  }
}

function setParam(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value)
  else params.delete(key)
}
