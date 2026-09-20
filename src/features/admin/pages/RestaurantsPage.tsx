import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '../api/adminKeys'
import { restaurantsApi } from '../api/restaurantsApi'
import { retryAdminQuery } from '../api/queryPolicy'
import type { AdminSortDirection, RestaurantListCriteria, RestaurantStatus } from '../../../shared/types/admin'
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  Pagination,
  SortButton,
  Toast,
} from '../../../shared/components/AdminUi'
import { formatDateTime } from '../../../shared/utils/adminFormatting'
import { PackageAssignmentBadge, RestaurantSubscriptionActions } from '../components/RestaurantSubscriptionActions'

const defaults: RestaurantListCriteria = {
  q: '',
  status: '',
  page: 0,
  size: 20,
  sortBy: 'createdAt',
  direction: 'desc',
}
const statuses: Array<RestaurantStatus | ''> = ['', 'ACTIVE', 'INACTIVE', 'SUSPENDED']

export function RestaurantsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const criteria = readCriteria(searchParams)
  const [search, setSearch] = useState(criteria.q)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchParams((current) => {
        if (current.get('q') === search) return current
        if (search) current.set('q', search)
        else current.delete('q')
        current.set('page', '0')
        return current
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [search, setSearchParams])
  const query = useQuery({
    queryKey: adminKeys.restaurants(criteria),
    queryFn: () => restaurantsApi.list(criteria),
    retry: retryAdminQuery,
  })
  const data = query.data
  const update = (changes: Partial<RestaurantListCriteria>) =>
    setSearchParams((current) => {
      const next = { ...criteria, ...changes }
      Object.entries(next).forEach(([key, value]) => {
        const defaultValue = defaults[key as keyof RestaurantListCriteria]
        if (value === defaultValue || value === '') current.delete(key)
        else current.set(key, String(value))
      })
      return current
    })
  const emptyDescription = useMemo(
    () => (criteria.q || criteria.status ? 'Thử thay đổi bộ lọc hoặc từ khóa.' : 'Chưa có nhà hàng nào.'),
    [criteria.q, criteria.status],
  )

  return (
    <>
      <PageHeader
        eyebrow="System / Restaurants"
        title="Restaurants"
        description="Tra cứu nhà hàng và quản lý trạng thái gán gói từ API admin."
      />
      {toast && <Toast message={toast.message} tone={toast.tone} />}
      <section className="card table-card">
        <div className="toolbar">
          <label className="search-field">
            <span className="sr-only">Tìm nhà hàng</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value.slice(0, 100))}
              placeholder="Tìm theo code, tên…"
              maxLength={100}
            />
          </label>
          <select
            aria-label="Lọc trạng thái nhà hàng"
            value={criteria.status}
            onChange={(event) => update({ status: event.target.value as RestaurantListCriteria['status'], page: 0 })}
          >
            {statuses.map((status) => (
              <option value={status} key={status}>
                {status || 'Tất cả trạng thái'}
              </option>
            ))}
          </select>
        </div>
        {query.isLoading ? (
          <LoadingSkeleton rows={7} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !data || data.content.length === 0 ? (
          <EmptyState title="Không có nhà hàng" description={emptyDescription} />
        ) : (
          <>
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>
                      <SortButton
                        label="Code"
                        active={criteria.sortBy === 'code'}
                        direction={criteria.direction}
                        onClick={() => updateSort('code', criteria, update)}
                      />
                    </th>
                    <th>
                      <SortButton
                        label="Tên"
                        active={criteria.sortBy === 'name'}
                        direction={criteria.direction}
                        onClick={() => updateSort('name', criteria, update)}
                      />
                    </th>
                    <th>
                      <SortButton
                        label="Status"
                        active={criteria.sortBy === 'status'}
                        direction={criteria.direction}
                        onClick={() => updateSort('status', criteria, update)}
                      />
                    </th>
                    <th>Gói dịch vụ</th>
                    <th>
                      <SortButton
                        label="Cập nhật"
                        active={criteria.sortBy === 'updatedAt'}
                        direction={criteria.direction}
                        onClick={() => updateSort('updatedAt', criteria, update)}
                      />
                    </th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.content.map((restaurant) => (
                    <tr key={restaurant.id}>
                      <td>
                        <Link className="table-link" to={`/admin/restaurants/${encodeURIComponent(restaurant.id)}`}>
                          <code className="code-pill">{restaurant.code}</code>
                        </Link>
                      </td>
                      <td>
                        <Link className="table-link" to={`/admin/restaurants/${encodeURIComponent(restaurant.id)}`}>
                          <strong>{restaurant.name}</strong>
                          <span className="muted">
                            {restaurant.timezone} · {restaurant.currencyCode}
                          </span>
                        </Link>
                      </td>
                      <td>
                        <RestaurantStatusBadge status={restaurant.status} />
                      </td>
                      <td>
                        <PackageAssignmentBadge state={restaurant.packageAssignmentState} />
                        {restaurant.effectiveSubscription && (
                          <small className="muted block">
                            {restaurant.effectiveSubscription.packageCode} · đến{' '}
                            {formatDateTime(restaurant.effectiveSubscription.endAt)}
                          </small>
                        )}
                      </td>
                      <td className="muted">{formatDateTime(restaurant.updatedAt)}</td>
                      <td className="row-actions">
                        <RestaurantSubscriptionActions
                          restaurant={restaurant}
                          onNotify={(message, tone) => setToast({ message, tone })}
                        />
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

function updateSort(
  sortBy: RestaurantListCriteria['sortBy'],
  criteria: RestaurantListCriteria,
  update: (changes: Partial<RestaurantListCriteria>) => void,
) {
  const direction: AdminSortDirection = criteria.sortBy === sortBy && criteria.direction === 'asc' ? 'desc' : 'asc'
  update({ sortBy, direction, page: 0 })
}
export function RestaurantStatusBadge({ status }: { status: RestaurantStatus }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <span className="status-dot" />
      {status}
    </span>
  )
}
function readCriteria(params: URLSearchParams): RestaurantListCriteria {
  const sortBy = params.get('sortBy')
  const direction = params.get('direction')
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    status: statuses.includes(params.get('status') as RestaurantStatus)
      ? (params.get('status') as RestaurantListCriteria['status'])
      : '',
    page: Math.max(0, Number(params.get('page') ?? defaults.page) || 0),
    size: clampSize(params.get('size')),
    sortBy: ['createdAt', 'updatedAt', 'code', 'name', 'status'].includes(sortBy ?? '')
      ? (sortBy as RestaurantListCriteria['sortBy'])
      : defaults.sortBy,
    direction: direction === 'asc' ? 'asc' : defaults.direction,
  }
}
function clampSize(value: string | null) {
  const size = Number(value ?? defaults.size)
  return Number.isInteger(size) && size >= 1 && size <= 100 ? size : defaults.size
}
