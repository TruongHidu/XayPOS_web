import { useMemo, useState } from 'react'
import type { PrivateMenuItem } from '../../menu/schemas'
import { useOrderMenuPicker } from '../hooks/useOrderMenuPicker'
import { moneyMinor, formatMinor } from '../../../shared/utils/scaledDecimal'
import { OrderFeedback, OrderPager } from './OrderUi'
import { orderError } from '../utils/orderErrors'
import { useOrderDraftStore, draftFrozen } from '../store/orderDraftStore'

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
  const cartLines = useOrderDraftStore((s) => s.lines)
  const isDraftFrozen = useOrderDraftStore((s) => draftFrozen(s))
  const [liveAnnouncement, setLiveAnnouncement] = useState('')
  const [animatingId, setAnimatingId] = useState<string | null>(null)

  const cartCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of cartLines) {
      const q = parseFloat(l.quantity) || 0
      counts.set(l.item.id, (counts.get(l.item.id) || 0) + q)
    }
    return counts
  }, [cartLines])

  const handleAddItem = (item: PrivateMenuItem) => {
    if (disabled || !item.sellable) return
    onAdd(item)
    setAnimatingId(item.id)
    setLiveAnnouncement(`Đã thêm ${item.name} vào giỏ`)
    setTimeout(() => setAnimatingId(null), 300)
  }

  if (p.items.error && orderError(p.items.error).status === 403) return <OrderFeedback error={p.items.error} />
  if (!p.enabled && p.search.length <= 100)
    return (
      <div className="order-empty">Cần MENU_VIEW và MENU_MANAGEMENT để chọn món. Liên hệ người quản lý cấp quyền.</div>
    )

  return (
    <section className="order-catalog" aria-label="Chọn món">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      <div className="order-panel-heading">
        <div>
          <h3>Thực đơn</h3>
          <span className="order-muted">Món đang được bán</span>
        </div>
        {p.items.data?.totalElements !== undefined && (
          <span className="pos-count-chip">{p.items.data.totalElements} món</span>
        )}
      </div>

      <div className="pos-search-wrapper pos-sticky-search">
        <label className="order-search">
          <span className="pos-search-icon" aria-hidden="true">🔍</span>
          <input
            maxLength={100}
            value={p.search}
            onChange={(e) => p.setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') p.setSearch('')
            }}
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

      {disabled && isDraftFrozen && (
        <div className="pos-menu-frozen-banner" role="status">
          🔒 Giỏ hàng đang được xử lý hoặc đã khóa, tạm thời không thể thêm món.
        </div>
      )}

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
        {p.items.data?.content.map((item) => {
          const inCartCount = cartCounts.get(item.id) || 0
          const isAnimating = animatingId === item.id
          const isItemDisabled = disabled || !item.sellable

          return (
            <button
              type="button"
              className={`order-menu-card ${isItemDisabled ? 'is-disabled' : ''} ${!item.sellable ? 'is-out-of-stock' : ''} ${isAnimating ? 'is-pop-active' : ''}`}
              key={item.id}
              onClick={() => handleAddItem(item)}
              disabled={isItemDisabled}
              aria-label={'Thêm ' + item.name}
            >
              {inCartCount > 0 && (
                <span className="pos-menu-card-badge" aria-label={`Đã có ${inCartCount} trong giỏ`}>
                  {inCartCount}
                </span>
              )}

              {!item.sellable && (
                <span className="pos-menu-card-badge pos-badge-soldout">
                  Hết hàng
                </span>
              )}

              <div className="order-menu-img-wrap">
                {item.imageUrl ? (
                  <img
                    loading="lazy"
                    src={item.imageUrl}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                      const fallback = e.currentTarget.parentElement?.querySelector('.pos-menu-img-fallback')
                      if (fallback) (fallback as HTMLElement).style.display = 'flex'
                    }}
                  />
                ) : null}
                <div
                  className="pos-menu-img-fallback"
                  style={{ display: item.imageUrl ? 'none' : 'flex' }}
                  aria-hidden="true"
                >
                  <span className="order-food-icon" aria-hidden="true">
                    ♨
                  </span>
                </div>
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
              <span className={`order-add-sign ${isAnimating ? 'animating' : ''}`} aria-hidden="true">
                +
              </span>
            </button>
          )
        })}
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
