import type { PrivateMenuItem } from '../../menu/schemas'
import { useOrderMenuPicker } from '../hooks/useOrderMenuPicker'
import { moneyMinor, formatMinor } from '../../../shared/utils/scaledDecimal'
import { OrderFeedback, OrderPager } from './OrderUi'
import { orderError } from '../utils/orderErrors'

export function MenuPicker({
  permission,
  onAdd,
  disabled = false,
}: {
  permission: string
  onAdd: (item: PrivateMenuItem) => void
  disabled?: boolean
}) {
  const p = useOrderMenuPicker(permission)
  if (p.items.error && orderError(p.items.error).status === 403) return <OrderFeedback error={p.items.error} />
  if (!p.enabled && p.search.length <= 100)
    return (
      <div className="order-empty">Cần MENU_VIEW và MENU_MANAGEMENT để chọn món. Liên hệ người quản lý cấp quyền.</div>
    )

  return (
    <section className="order-catalog" aria-label="Chọn món">
      <div className="order-panel-heading">
        <div>
          <h3>Thực đơn</h3>
          <span className="order-muted">Món đang được bán</span>
        </div>
        {p.items.data?.totalElements !== undefined && (
          <span className="pos-count-chip">{p.items.data.totalElements} món</span>
        )}
      </div>

      <div className="pos-search-wrapper">
        <label className="order-search">
          <span className="pos-search-icon" aria-hidden="true">🔍</span>
          <input
            maxLength={100}
            value={p.search}
            onChange={(e) => p.setSearch(e.target.value)}
            placeholder="Nhập tên món..."
            aria-label="Tìm món"
          />
          {p.search && (
            <button
              type="button"
              className="pos-search-clear-btn"
              onClick={() => p.setSearch('')}
              aria-label="Xóa tìm kiếm"
            >
              ✕
            </button>
          )}
        </label>
      </div>

      <div className="order-chips" role="tablist" aria-label="Nhóm món">
        <button
          type="button"
          aria-pressed={!p.groupId}
          className={`pos-chip ${!p.groupId ? 'active' : ''}`}
          onClick={() => p.setGroup(undefined)}
        >
          Tất cả nhóm
        </button>
        {p.groups.data?.pages
          .flatMap((page) => page.content)
          .map((g) => (
            <button
              type="button"
              key={g.id}
              aria-pressed={p.groupId === g.id}
              className={`pos-chip ${p.groupId === g.id ? 'active' : ''}`}
              onClick={() => p.setGroup(g.id)}
            >
              {g.name}
            </button>
          ))}
        {p.groups.hasNextPage && (
          <button
            type="button"
            className="pos-chip pos-chip-more"
            disabled={p.groups.isFetchingNextPage}
            onClick={() => void p.groups.fetchNextPage()}
          >
            Thêm nhóm
          </button>
        )}
      </div>

      <OrderFeedback error={p.groups.error} onRetry={() => void p.groups.refetch()} />
      <OrderFeedback error={p.items.error} onRetry={() => void p.items.refetch()} />

      {p.items.isFetching && (
        <div className="pos-menu-loading">
          <p role="status">Đang tải món...</p>
          <div className="pos-skeleton-menu-grid">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="pos-skeleton-menu-card" />
            ))}
          </div>
        </div>
      )}

      {p.items.data?.content.length === 0 && !p.items.isFetching && (
        <div className="pos-empty-state">
          <span className="pos-empty-icon" aria-hidden="true">🍽</span>
          <p className="order-empty">Không có món phù hợp.</p>
        </div>
      )}

      <div className="order-menu-grid">
        {p.items.data?.content.map((item) => (
          <button
            type="button"
            className="order-menu-card"
            key={item.id}
            onClick={() => onAdd(item)}
            disabled={disabled || !item.sellable}
            aria-label={'Thêm ' + item.name}
          >
            <div className="order-menu-img-wrap">
              {item.imageUrl ? (
                <img
                  loading="lazy"
                  src={item.imageUrl}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <span className="order-food-icon" aria-hidden="true">
                  ♨
                </span>
              )}
            </div>
            <div className="order-menu-info">
              <strong title={item.name}>{item.name}</strong>
              <div className="order-menu-price-row">
                <span className="pos-menu-price">
                  {formatMinor(moneyMinor(item.salePrice))}
                </span>
                <span className="pos-menu-unit">/ {item.baseUnit}</span>
              </div>
            </div>
            <span className="order-add-sign" aria-hidden="true">
              +
            </span>
          </button>
        ))}
      </div>

      <OrderPager
        page={p.items.data?.page ?? 0}
        totalPages={p.items.data?.totalPages ?? 0}
        loading={p.items.isFetching}
        onPage={p.setPage}
      />
    </section>
  )
}
