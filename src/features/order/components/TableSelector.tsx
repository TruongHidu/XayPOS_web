import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useOrderServiceContext } from '../hooks/useOrderServiceContext'
import { useOrderAccess } from '../hooks/useOrderAccess'
import { orderKeys } from '../api/orderKeys'
import { ordersApi } from '../api/ordersApi'
import type { ServiceContext } from '../types'
import { OrderFeedback, OrderPager } from './OrderUi'
import { ServiceIcon } from './ServiceIcon'

export function TableSelector({
  onSelect,
  onTakeaway,
  canTakeaway,
}: {
  onSelect: (context: ServiceContext) => void
  onTakeaway: () => void
  canTakeaway: boolean
}) {
  const { scope } = useOrderAccess()
  const h = useOrderServiceContext('DINE_IN')
  const [error, setError] = useState<unknown>(null)

  const rawTables = h.tables.data?.content ?? []

  // Thu thập các bàn đang có phiên để kiểm tra trạng thái đơn phục vụ
  const occupiedTables = rawTables.filter(
    (t) => (t.occupied || t.currentSession) && !!t.currentSession?.id,
  )

  const activeOrderQueries = useQueries({
    queries: occupiedTables.map((t) => ({
      queryKey: orderKeys.active(scope, t.currentSession!.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => ordersApi.active(scope!, t.currentSession!.id, signal),
      enabled: !!scope && !!t.currentSession?.id,
      staleTime: 5000,
      retry: false,
    })),
  })

  // Map sessionId -> hasActiveOrder
  const sessionHasOrder = new Map<string, boolean>()
  occupiedTables.forEach((t, i) => {
    const q = activeOrderQueries[i]
    if (q && q.data) {
      sessionHasOrder.set(t.currentSession!.id, true)
    }
  })

  // Lọc danh sách bàn theo yêu cầu nghiệp vụ:
  // "chỉ lấy bàn không có session hoặc có session đang mở nhưng chưa có đơn"
  const displayTables = rawTables.filter((t) => {
    if (h.occupied === true) {
      return !!(t.occupied || t.currentSession)
    }
    if (h.occupied === false) {
      return !t.occupied && !t.currentSession
    }
    // Mặc định phần tạo đơn:
    // 1. Bàn không có session -> LẤY
    if (!t.occupied && !t.currentSession) return true
    // 2. Bàn có session: nếu đã có đơn đang phục vụ -> LOẠI BỎ KHỎI DANH SÁCH TẠO ĐƠN
    const sId = t.currentSession?.id
    if (sId && sessionHasOrder.get(sId)) {
      return false
    }
    return true
  })

  const choose = async (id: string) => {
    setError(null)
    try {
      const table = await h.prepare.mutateAsync(id)
      if (table.status !== 'AVAILABLE' || table.area?.active === false) throw new Error('TABLE_INACTIVE')
      onSelect(table.occupied || table.currentSession ? await h.current(table.id) : h.emptyTableContext(table))
    } catch (e) {
      setError(e)
    }
  }

  return (
    <section className="order-tables" aria-label="Chọn bàn">
      <div className="order-panel-heading">
        <div>
          <h3>Sơ đồ bàn</h3>
          <span className="order-muted">Phiên mở khi gửi đơn</span>
        </div>
        {h.tables.data?.totalElements !== undefined && (
          <span className="pos-count-chip">{displayTables.length} bàn</span>
        )}
      </div>

      {h.enabled ? (
        <>
          <div className="order-table-filters" role="tablist" aria-label="Trạng thái bàn">
            {(
              [
                [undefined, 'Tất cả'],
                [true, 'Sử dụng'],
                [false, 'Còn trống'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                className={`pos-table-filter-btn ${h.occupied === value ? 'active' : ''}`}
                aria-pressed={h.occupied === value}
                onClick={() => h.setOccupied(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="order-chips" role="tablist" aria-label="Khu vực bàn">
            <button
              type="button"
              className={`pos-chip ${!h.areaId ? 'active' : ''}`}
              aria-pressed={!h.areaId}
              onClick={() => h.setArea(undefined)}
            >
              Tất cả khu vực
            </button>
            {h.areas.data?.pages
              .flatMap((p) => p.content)
              .map((a) => (
                <button
                  type="button"
                  key={a.id}
                  className={`pos-chip ${a.id === h.areaId ? 'active' : ''}`}
                  aria-pressed={a.id === h.areaId}
                  onClick={() => h.setArea(a.id)}
                >
                  {a.name}
                </button>
              ))}
            {h.areas.hasNextPage && (
              <button
                type="button"
                className="pos-chip pos-chip-more"
                disabled={h.areas.isFetchingNextPage}
                onClick={() => void h.areas.fetchNextPage()}
              >
                Thêm khu vực
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="order-muted">Cần TABLE_VIEW và TABLE_MANAGEMENT để dùng sơ đồ bàn.</p>
      )}

      <OrderFeedback error={error} />
      <OrderFeedback error={h.areas.error} onRetry={() => void h.areas.refetch()} />
      <OrderFeedback error={h.tables.error} onRetry={() => void h.tables.refetch()} />

      {h.tables.isFetching && <p role="status">Đang tải bàn...</p>}

      <div className="order-table-grid">
        {canTakeaway && (
          <button className="order-table-card pos-table-card-takeaway" type="button" onClick={onTakeaway}>
            <ServiceIcon takeaway />
            <strong>Mang đi</strong>
            <small>Đơn mang về</small>
            <small>Sẵn sàng</small>
          </button>
        )}

        {h.enabled &&
          displayTables.map((t) => {
            const hasSession = !!(t.occupied || t.currentSession)
            const sId = t.currentSession?.id
            const hasActiveOrder = hasSession && !!sId && !!sessionHasOrder.get(sId)
            const isWaitingOrder = hasSession && !hasActiveOrder
            const isDisabled =
              h.prepare.isPending ||
              t.status !== 'AVAILABLE' ||
              t.area?.active === false ||
              (!hasSession && !t.canOpen)

            let statusPillClass = 'available'
            let statusPillText = 'Trống'
            let statusDescText = 'Còn trống'

            if (hasActiveOrder) {
              statusPillClass = 'occupied'
              statusPillText = 'Có khách'
              statusDescText = 'Đang sử dụng'
            } else if (isWaitingOrder) {
              statusPillClass = 'waiting-order'
              statusPillText = 'Chờ gọi món'
              statusDescText = 'Phiên chưa có đơn'
            }

            return (
              <button
                className={`order-table-card ${hasActiveOrder ? 'is-occupied' : isWaitingOrder ? 'is-waiting-order' : 'is-available'} ${isDisabled ? 'is-disabled' : ''}`}
                type="button"
                key={t.id}
                aria-label={t.name + ' ' + (hasSession ? 'Đang sử dụng' : 'Còn trống')}
                disabled={isDisabled}
                onClick={() => void choose(t.id)}
              >
                <div className="pos-table-card-top">
                  <ServiceIcon />
                  <span className={`pos-table-status-pill ${statusPillClass}`}>
                    {statusPillText}
                  </span>
                </div>
                <strong>{t.name}</strong>
                <small>{t.area?.name}</small>
                <small>{statusDescText}</small>
                {t.capacity !== undefined && (
                  <span className="pos-table-capacity">👥 {t.capacity} chỗ</span>
                )}
              </button>
            )
          })}
      </div>

      {h.enabled && displayTables.length === 0 && !h.tables.isFetching && (
        <p className="order-empty">Không có bàn phù hợp.</p>
      )}

      {h.enabled && (
        <OrderPager
          page={h.tables.data?.page ?? 0}
          totalPages={h.tables.data?.totalPages ?? 0}
          loading={h.tables.isFetching}
          onPage={h.setPage}
        />
      )}
    </section>
  )
}
