import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { packagesApi } from '../api/packagesApi'
import { adminKeys } from '../api/adminKeys'
import { retryAdminQuery } from '../api/queryPolicy'
import { PackageFormModal } from '../components/PackageFormModal'
import { useAuthStore } from '../../auth/store/authStore'
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader, Toast } from '../../../shared/components/AdminUi'
import { formatMoney } from '../../../shared/utils/adminFormatting'

type PackageFilter = 'all' | 'active' | 'inactive'

export function PackagePage() {
  const user = useAuthStore((state) => state.user)
  const canManage = Boolean(user?.permissions.includes('PACKAGE_MANAGE'))
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PackageFilter>('all')
  const [editing, setEditing] = useState<string | null | undefined>(undefined)
  const [searchParams, setSearchParams] = useSearchParams()
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const query = useQuery({
    queryKey: adminKeys.packages(true),
    queryFn: () => packagesApi.list(true),
    retry: retryAdminQuery,
  })
  const requestedEdit = searchParams.get('edit')
  const editor = editing !== undefined ? editing : (requestedEdit ?? undefined)
  const closeEditor = () => {
    setEditing(undefined)
    if (searchParams.has('edit')) setSearchParams({}, { replace: true })
  }
  const startCreate = () => {
    setSearchParams({}, { replace: true })
    setEditing(null)
  }
  const packages = useMemo(
    () =>
      (query.data ?? []).filter((item) => {
        const text = `${item.code} ${item.name}`.toLowerCase()
        return (
          text.includes(search.toLowerCase()) &&
          (filter === 'all' || (filter === 'active' ? item.active : !item.active))
        )
      }),
    [filter, query.data, search],
  )
  return (
    <>
      <PageHeader
        eyebrow="Catalog / Packages"
        title="Packages"
        description="Quản lý catalog package và các feature được gắn vào từng gói."
        actions={
          canManage ? (
            <button className="button button-primary" type="button" onClick={startCreate}>
              + Tạo package
            </button>
          ) : undefined
        }
      />
      {toast && <Toast message={toast.message} tone={toast.tone} />}
      <section className="card table-card">
        <div className="toolbar">
          <label className="search-field">
            <span className="sr-only">Tìm package</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo code hoặc tên…"
            />
          </label>
          <div className="filter-tabs" role="group" aria-label="Lọc trạng thái">
            {(['all', 'active', 'inactive'] as PackageFilter[]).map((item) => (
              <button
                className={filter === item ? 'selected' : ''}
                key={item}
                type="button"
                onClick={() => setFilter(item)}
              >
                {item === 'all' ? 'Tất cả' : item === 'active' ? 'Active' : 'Inactive'}
              </button>
            ))}
          </div>
        </div>
        {query.isLoading ? (
          <LoadingSkeleton />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : packages.length === 0 ? (
          <EmptyState
            title="Không có package phù hợp"
            description={
              search || filter !== 'all' ? 'Thử thay đổi từ khóa hoặc bộ lọc.' : 'Chưa có package nào trong catalog.'
            }
          />
        ) : (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Giá</th>
                  <th>Chu kỳ</th>
                  <th>Features</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {packages.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link className="table-link" to={`/admin/packages/${encodeURIComponent(item.code)}`}>
                        <code className="code-pill">{item.code}</code>
                        <strong>{item.name}</strong>
                      </Link>
                    </td>
                    <td>{formatMoney(item.priceAmount, item.currencyCode)}</td>
                    <td>{item.billingCycleMonths} tháng</td>
                    <td>{item.features.length}</td>
                    <td>
                      <span className={`status-badge ${item.active ? 'status-active' : 'status-inactive'}`}>
                        <span className="status-dot" />
                        {item.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="row-actions">
                      {canManage && (
                        <button
                          className="button button-small button-ghost"
                          type="button"
                          onClick={() => setEditing(item.code)}
                        >
                          Sửa
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editor !== undefined && canManage && (
        <PackageFormModal
          packageCode={editor}
          canManage={canManage}
          onClose={closeEditor}
          onSuccess={(message) => {
            closeEditor()
            setToast({ message, tone: 'success' })
          }}
          onError={(message) => setToast({ message, tone: 'error' })}
        />
      )}
    </>
  )
}
