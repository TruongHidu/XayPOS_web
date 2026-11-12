import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { adminKeys } from '../api/adminKeys'
import { adminPurchasesApi } from '../api/adminPaymentsApi'
import { retryAdminQuery } from '../api/queryPolicy'
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader, Pagination } from '../../../shared/components/AdminUi'
import type { PurchaseCriteria, PurchaseStatus } from '../../../shared/types/adminPayments'
import { formatDateTime } from '../../../shared/utils/adminFormatting'
import { Money, PurchaseStatusBadge, ReasonTag } from '../components/PaymentUi'
import { purchaseStatusLabel } from '../utils/paymentLabels'
import '../admin-payments.css'

const statuses = Object.keys(purchaseStatusLabel) as PurchaseStatus[]

export function PurchaseListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const criteria = readCriteria(searchParams)
  const [search, setSearch] = useState(criteria.q)
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
  const query = useQuery({
    queryKey: adminKeys.purchases(criteria),
    queryFn: () => adminPurchasesApi.list(criteria),
    retry: retryAdminQuery,
  })
  const update = (changes: Partial<PurchaseCriteria>) =>
    setSearchParams((current) => {
      const next = { ...criteria, ...changes }
      if (next.status) current.set('status', next.status)
      else current.delete('status')
      if (next.page) current.set('page', String(next.page))
      else current.delete('page')
      return current
    })
  const data = query.data
  return (
    <>
      <PageHeader
        eyebrow="Thanh toán"
        title="Đơn mua gói"
        description="Các đơn mua/gia hạn gói mà chủ nhà hàng tạo trực tuyến, kèm trạng thái thanh toán và kích hoạt."
      />
      <section className="card table-card">
        <div className="toolbar filter-toolbar">
          <label className="search-field">
            <span className="sr-only">Tìm đơn mua</span>
            <input
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo mã/tên nhà hàng hoặc mã gói…"
            />
          </label>
          <select
            aria-label="Lọc trạng thái đơn"
            value={criteria.status}
            onChange={(event) => update({ status: event.target.value as PurchaseStatus | '', page: 0 })}
          >
            <option value="">Mọi trạng thái</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {purchaseStatusLabel[status]}
              </option>
            ))}
          </select>
        </div>
        {query.isLoading ? (
          <LoadingSkeleton rows={8} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !data || data.content.length === 0 ? (
          <EmptyState title="Chưa có đơn mua gói" description="Không có đơn nào phù hợp với bộ lọc hiện tại." />
        ) : (
          <>
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>Nhà hàng</th>
                    <th>Gói</th>
                    <th>Số tiền</th>
                    <th>Trạng thái</th>
                    <th>Tạo lúc</th>
                    <th>Thanh toán lúc</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.content.map((purchase) => (
                    <tr key={purchase.id}>
                      <td>
                        <strong>{purchase.restaurant.code}</strong>
                        <span className="muted block">{purchase.restaurant.name}</span>
                      </td>
                      <td>
                        <strong>{purchase.packageCode}</strong>
                        <span className="muted block">{purchase.packageName}</span>
                      </td>
                      <td>
                        <Money amount={purchase.amount} />
                      </td>
                      <td>
                        <PurchaseStatusBadge status={purchase.status} />
                        {purchase.status === 'REVIEW_REQUIRED' && (
                          <div>
                            <ReasonTag reason={purchase.reviewReason} />
                          </div>
                        )}
                      </td>
                      <td>{formatDateTime(purchase.createdAt)}</td>
                      <td>{formatDateTime(purchase.paidAt)}</td>
                      <td className="row-actions">
                        <Link className="button button-small button-ghost" to={`/admin/purchases/${encodeURIComponent(purchase.id)}`}>
                          Xem
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} onPageChange={(page) => update({ page })} />
          </>
        )}
      </section>
    </>
  )
}

function readCriteria(params: URLSearchParams): PurchaseCriteria {
  const status = params.get('status') as PurchaseStatus | null
  return {
    status: status && statuses.includes(status) ? status : '',
    restaurantId: params.get('restaurantId') ?? '',
    q: params.get('q') ?? '',
    page: Math.max(0, Number(params.get('page') ?? 0) || 0),
    size: 20,
  }
}
