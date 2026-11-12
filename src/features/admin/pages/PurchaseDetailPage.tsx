import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { adminKeys } from '../api/adminKeys'
import { adminPurchasesApi } from '../api/adminPaymentsApi'
import { retryAdminQuery } from '../api/queryPolicy'
import { useAuthStore } from '../../auth/store/authStore'
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader, Toast } from '../../../shared/components/AdminUi'
import type { PurchaseDetail } from '../../../shared/types/adminPayments'
import { formatDateTime } from '../../../shared/utils/adminFormatting'
import { PaymentEventCard } from '../components/PaymentEventCard'
import { Money, PurchaseStatusBadge, ReasonDialog, ReasonTag } from '../components/PaymentUi'
import { reviewReasonInfo } from '../utils/paymentLabels'
import '../admin-payments.css'

export function PurchaseDetailPage() {
  const { purchaseId = '' } = useParams()
  const canReview = Boolean(useAuthStore((state) => state.user?.permissions.includes('SUBSCRIPTION_PAYMENT_REVIEW')))
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])
  const query = useQuery({
    queryKey: adminKeys.purchase(purchaseId),
    queryFn: () => adminPurchasesApi.getById(purchaseId),
    enabled: Boolean(purchaseId),
    retry: retryAdminQuery,
  })
  if (query.isLoading) return <LoadingSkeleton rows={8} />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data) return <EmptyState title="Không tìm thấy đơn mua" description="Đơn mua không tồn tại." />
  const detail = query.data
  const purchase = detail.purchase
  return (
    <>
      <PageHeader
        eyebrow="Thanh toán / Đơn mua gói"
        title={`${purchase.packageName} · ${purchase.restaurant.name}`}
        description={`Đơn mua gói ${purchase.packageCode} của nhà hàng ${purchase.restaurant.code}.`}
        actions={
          <div className="page-actions">
            <Link className="button button-ghost" to="/admin/purchases">
              ← Đơn mua gói
            </Link>
            {canReview && <PurchaseReviewActions detail={detail} onDone={setToast} />}
          </div>
        }
      />
      {toast && <Toast message={toast} />}
      {purchase.status === 'REVIEW_REQUIRED' && purchase.reviewReason && (
        <div className="warning-banner">
          <strong>Đơn đang chờ xử lý: {reviewReasonInfo[purchase.reviewReason]?.label ?? purchase.reviewReason}</strong>
          <span>
            {purchase.paidAt
              ? 'Khách đã thanh toán. Khắc phục nguyên nhân rồi bấm "Kích hoạt lại", hoặc hoàn tiền và đóng đơn.'
              : reviewReasonInfo[purchase.reviewReason]?.hint}
          </span>
        </div>
      )}
      <section className="card detail-card">
        <div className="detail-title">
          <code className="code-pill">{purchase.id}</code>
          <PurchaseStatusBadge status={purchase.status} />
        </div>
        <div className="result-grid">
          <Fact label="Nhà hàng">
            <Link to={`/admin/restaurants/${encodeURIComponent(purchase.restaurant.id)}`}>
              {purchase.restaurant.code} · {purchase.restaurant.name}
            </Link>
          </Fact>
          <Fact label="Người tạo">{detail.createdByName ? `${detail.createdByName} (${detail.createdByEmail})` : '—'}</Fact>
          <Fact label="Số tiền">
            <Money amount={purchase.amount} />
          </Fact>
          <Fact label="Tạo lúc">{formatDateTime(purchase.createdAt)}</Fact>
          <Fact label="Hạn thanh toán">{formatDateTime(purchase.expiresAt)}</Fact>
          <Fact label="Thanh toán lúc">{formatDateTime(purchase.paidAt)}</Fact>
          <Fact label="Kích hoạt lúc">{formatDateTime(purchase.activatedAt)}</Fact>
          <Fact label="Gói đã tạo">
            {purchase.subscriptionId ? (
              <Link
                to={`/admin/restaurants/${encodeURIComponent(purchase.restaurant.id)}/subscriptions/${encodeURIComponent(purchase.subscriptionId)}`}
              >
                Xem gói
              </Link>
            ) : (
              '—'
            )}
          </Fact>
          <Fact label="Lý do xử lý">
            <ReasonTag reason={purchase.reviewReason} />
            {!purchase.reviewReason && '—'}
          </Fact>
        </div>
        {(detail.cancelReason || purchase.activationErrorCode) && (
          <p className="form-hint">
            {detail.cancelReason && <>Lý do huỷ: {detail.cancelReason}. </>}
            {purchase.activationErrorCode && (
              <>
                Lỗi kích hoạt gần nhất: <code>{purchase.activationErrorCode}</code> (đã thử {detail.activationRetryCount} lần).
              </>
            )}
          </p>
        )}
      </section>

      <section className="card table-card purchase-section">
        <div className="section-heading section-padding">
          <div>
            <div className="eyebrow">Mã QR đã tạo</div>
            <h3>Lần thanh toán</h3>
          </div>
        </div>
        {detail.attempts.length === 0 ? (
          <EmptyState title="Chưa tạo mã thanh toán" description="Chủ nhà hàng chưa mở mã QR chuyển khoản cho đơn này." />
        ) : (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Mã thanh toán</th>
                  <th>Trạng thái</th>
                  <th>Số tiền</th>
                  <th>Tạo lúc</th>
                  <th>Hết hạn</th>
                  <th>Thanh toán lúc</th>
                </tr>
              </thead>
              <tbody>
                {detail.attempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td>
                      <code className="code-pill">{attempt.referenceCode}</code>
                    </td>
                    <td>{attempt.status}</td>
                    <td>
                      <Money amount={attempt.amount} />
                    </td>
                    <td>{formatDateTime(attempt.createdAt)}</td>
                    <td>{formatDateTime(attempt.expiresAt)}</td>
                    <td>{formatDateTime(attempt.paidAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="purchase-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Sao kê</div>
            <h3>Giao dịch chuyển khoản liên quan</h3>
          </div>
        </div>
        {detail.events.length === 0 ? (
          <section className="card">
            <EmptyState title="Chưa nhận được chuyển khoản" description="Ngân hàng chưa báo giao dịch nào cho đơn này." />
          </section>
        ) : (
          <div className="payment-event-list">
            {detail.events.map((event) => (
              <PaymentEventCard key={event.id} event={event} canReview={canReview} onDone={setToast} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function PurchaseReviewActions({ detail, onDone }: { detail: PurchaseDetail; onDone: (message: string) => void }) {
  const [open, setOpen] = useState<'close' | 'resume' | null>(null)
  const queryClient = useQueryClient()
  const purchase = detail.purchase
  if (purchase.status !== 'REVIEW_REQUIRED') return null
  const finish = async (message: string) => {
    setOpen(null)
    await queryClient.invalidateQueries({ queryKey: adminKeys.all })
    onDone(message)
  }
  return (
    <>
      {purchase.paidAt && (
        <button className="button button-primary" type="button" onClick={() => setOpen('resume')}>
          Kích hoạt lại
        </button>
      )}
      <button className="button button-danger" type="button" onClick={() => setOpen('close')}>
        Đóng đơn
      </button>
      {open === 'resume' && (
        <ReasonDialog
          title="Kích hoạt lại gói"
          description="Hệ thống sẽ thử kích hoạt gói đã thanh toán. Hãy chắc chắn nguyên nhân (gói đang chạy, nhà hàng bị khoá…) đã được xử lý."
          fields={[]}
          submitLabel="Kích hoạt lại"
          onClose={() => setOpen(null)}
          onSubmit={async () => {
            const result = await adminPurchasesApi.resumeActivation(purchase.id)
            await finish(result.purchase.status === 'ACTIVATED' ? 'Đã kích hoạt gói.' : 'Đã gửi yêu cầu kích hoạt lại.')
          }}
        />
      )}
      {open === 'close' && (
        <ReasonDialog
          title="Đóng đơn mua"
          danger
          description={
            purchase.paidAt
              ? 'Đơn đã nhận tiền. Chỉ đóng sau khi đã hoàn tiền cho khách. Chủ nhà hàng sẽ có thể tạo đơn mới.'
              : 'Đóng đơn để chủ nhà hàng có thể tạo đơn mua mới.'
          }
          fields={[{ name: 'note', label: 'Ghi chú', minLength: 10, maxLength: 1000, multiline: true }]}
          submitLabel="Đóng đơn"
          onClose={() => setOpen(null)}
          onSubmit={async (values) => {
            await adminPurchasesApi.close(purchase.id, values.note)
            await finish('Đã đóng đơn mua.')
          }}
        />
      )}
    </>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="eyebrow">{label}</span>
      <strong>{children}</strong>
    </div>
  )
}
