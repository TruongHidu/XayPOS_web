import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '../api/adminKeys'
import { restaurantUsersApi } from '../api/restaurantUsersApi'
import { retryAdminQuery } from '../api/queryPolicy'
import type { RestaurantUserCriteria } from '../../../shared/types/admin'
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Modal,
  Pagination,
  SortButton,
} from '../../../shared/components/AdminUi'
import { formatDateTime } from '../../../shared/utils/adminFormatting'

const defaults: RestaurantUserCriteria = {
  q: '',
  roleCode: '',
  active: '',
  page: 0,
  size: 20,
  sortBy: 'createdAt',
  direction: 'desc',
}

// Remount on restaurant changes so filters, selection and pending debounce never cross tenants.
export function RestaurantUsersTab({ restaurantId }: { restaurantId: string }) {
  return <RestaurantUsersContent key={restaurantId} restaurantId={restaurantId} />
}

function RestaurantUsersContent({ restaurantId }: { restaurantId: string }) {
  const [criteria, setCriteria] = useState(defaults)
  const [search, setSearch] = useState('')
  const [roleCode, setRoleCode] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const q = search.trim()
      const role = roleCode.trim().toUpperCase()
      setCriteria((current) =>
        current.q === q && current.roleCode === role ? current : { ...current, q, roleCode: role, page: 0 },
      )
    }, 400)
    return () => window.clearTimeout(timer)
  }, [search, roleCode])
  const query = useQuery({
    queryKey: adminKeys.restaurantUsers(restaurantId, criteria),
    queryFn: () => restaurantUsersApi.list(restaurantId, criteria),
    retry: retryAdminQuery,
  })
  const update = (changes: Partial<RestaurantUserCriteria>) => setCriteria((current) => ({ ...current, ...changes }))
  const sort = (sortBy: RestaurantUserCriteria['sortBy']) =>
    update({ sortBy, direction: criteria.sortBy === sortBy && criteria.direction === 'asc' ? 'desc' : 'asc', page: 0 })
  const data = query.data
  return (
    <>
      <section className="card table-card" aria-label="Tài khoản nhà hàng">
        <div className="toolbar">
          <label className="search-field">
            <span className="sr-only">Tìm tài khoản</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={100}
              placeholder="Tìm họ tên, email, số điện thoại…"
            />
          </label>
          <label>
            <span className="sr-only">Lọc role</span>
            <input
              value={roleCode}
              onChange={(event) => setRoleCode(event.target.value)}
              maxLength={50}
              list="restaurant-user-roles"
              placeholder="Mã role (OWNER, CASHIER…)"
            />
            <datalist id="restaurant-user-roles">
              {['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'].map((role) => (
                <option key={role} value={role} />
              ))}
            </datalist>
          </label>
          <select
            aria-label="Trạng thái tài khoản"
            value={criteria.active}
            onChange={(event) => update({ active: event.target.value as RestaurantUserCriteria['active'], page: 0 })}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="true">ACTIVE</option>
            <option value="false">INACTIVE</option>
          </select>
          <select
            aria-label="Số tài khoản mỗi trang"
            value={criteria.size}
            onChange={(event) => update({ size: Number(event.target.value), page: 0 })}
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} / trang
              </option>
            ))}
          </select>
        </div>
        {query.isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !data || data.content.length === 0 ? (
          <EmptyState
            title="Không có tài khoản"
            description="Không tìm thấy tài khoản phù hợp với bộ lọc trong nhà hàng này."
          />
        ) : (
          <>
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>
                      <SortButton
                        label="Họ tên"
                        active={criteria.sortBy === 'name'}
                        direction={criteria.direction}
                        onClick={() => sort('name')}
                      />
                    </th>
                    <th>
                      <SortButton
                        label="Email"
                        active={criteria.sortBy === 'email'}
                        direction={criteria.direction}
                        onClick={() => sort('email')}
                      />
                    </th>
                    <th>Số điện thoại</th>
                    <th>Role</th>
                    <th>Trạng thái</th>
                    <th>
                      <SortButton
                        label="Lần đăng nhập cuối"
                        active={criteria.sortBy === 'lastLoginAt'}
                        direction={criteria.direction}
                        onClick={() => sort('lastLoginAt')}
                      />
                    </th>
                    <th>
                      <SortButton
                        label="Ngày tạo"
                        active={criteria.sortBy === 'createdAt'}
                        direction={criteria.direction}
                        onClick={() => sort('createdAt')}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.content.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <button className="button button-small button-ghost" onClick={() => setSelectedId(user.id)}>
                          {user.name}
                        </button>
                      </td>
                      <td>{user.email}</td>
                      <td>{user.phone ?? '—'}</td>
                      <td>
                        {user.role.name} <small>({user.role.code})</small>
                      </td>
                      <td>
                        <AccountStatus active={user.active} />
                      </td>
                      <td>{formatDateTime(user.lastLoginAt)}</td>
                      <td>{formatDateTime(user.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} onPageChange={(page) => update({ page })} />
          </>
        )}
      </section>
      {selectedId && (
        <RestaurantUserDialog restaurantId={restaurantId} userId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </>
  )
}

function RestaurantUserDialog({
  restaurantId,
  userId,
  onClose,
}: {
  restaurantId: string
  userId: string
  onClose: () => void
}) {
  const query = useQuery({
    queryKey: adminKeys.restaurantUser(restaurantId, userId),
    queryFn: () => restaurantUsersApi.getById(restaurantId, userId),
    retry: retryAdminQuery,
  })
  const user = query.data
  return (
    <Modal title="Chi tiết tài khoản" onClose={onClose}>
      {query.isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        user && (
          <div className="modal-form">
            <h3>{user.name}</h3>
            <AccountStatus active={user.active} />
            <dl className="detail-facts">
              {[
                ['Email', user.email],
                ['Số điện thoại', user.phone ?? '—'],
                ['Role', `${user.role.name} (${user.role.code})`],
                ['Trạng thái role', user.role.active ? 'ACTIVE' : 'INACTIVE'],
                ['Lần đăng nhập cuối', formatDateTime(user.lastLoginAt)],
                ['Ngày tạo', formatDateTime(user.createdAt)],
                ['Ngày cập nhật', formatDateTime(user.updatedAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="eyebrow">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )
      )}
    </Modal>
  )
}

function AccountStatus({ active }: { active: boolean }) {
  return (
    <span className={`status-badge status-${active ? 'active' : 'inactive'}`}>{active ? 'ACTIVE' : 'INACTIVE'}</span>
  )
}
