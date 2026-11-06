import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useOrders } from '../hooks/useOrders'
import { orderCriteriaSchema, orderStatusSchema, serviceTypeSchema } from '../schemas'
import type { Order, OrderCriteria, OrderSummary } from '../types'
import { useOrderAccess } from '../hooks/useOrderAccess'
import { canOrder, canSubmitType, canMarkServed, canCompleteOrder } from '../policies/orderAccessPolicy'
import { formatMinor, moneyMinor } from '../../../shared/utils/scaledDecimal'
import { OrderFeedback, OrderPager } from '../components/OrderUi'
import { orderLabels } from '../utils/orderLabels'
import { PaymentModal } from '../../payment/components/PaymentModal'
import { OrderAddItems } from '../components/OrderAddItems'
import { OrderDetailModal } from '../components/OrderDetailModal'
import { ordersApi } from '../api/ordersApi'
import { useQueryClient } from '@tanstack/react-query'
import { orderKeys } from '../api/orderKeys'
import { qrReviewCriteriaSchema } from '../../qr-order-review/schemas'
import { qrReviewKeys } from '../../qr-order-review/api/qrReviewKeys'
import { useQrReviewQueue } from '../../qr-order-review/hooks/useQrReview'
import { QrReviewQueue } from '../../qr-order-review/components/QrReviewQueue'
import { QrReviewModal } from '../../qr-order-review/components/QrReviewModal'
import '../order.css'

export function SessionOrders({ sessionId }: { sessionId: string }) {
  const { access } = useOrderAccess()
  if (!canOrder(access, 'ORDER_VIEW')) return null
  return (
    <section className="order-session-orders">
      <h4>Các đơn trong phiên</h4>
      <OrderRows criteria={orderCriteriaSchema.parse({ tableSessionId: sessionId })} />
      <Link to={'/cashier/orders?tableSessionId=' + encodeURIComponent(sessionId)}>Xem mọi trang đơn của phiên →</Link>
    </section>
  )
}

function formatRelativeTime(dateString: string): string {
  try {
    const diffMs = Date.now() - new Date(dateString).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Vừa tạo'
    if (diffMins < 60) return `${diffMins} phút trước`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours} giờ trước`
    return new Date(dateString).toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateString
  }
}

// Single Order Card component for Kanban columns and lists
function OrderCardItem({
  order,
  onPay,
  onAddItems,
  onOpenDetail,
}: {
  order: OrderSummary
  onPay?: (orderId: string) => void
  onAddItems?: (orderId: string) => void
  onOpenDetail?: (orderId: string) => void
}) {
  const { access, scope } = useOrderAccess()
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<unknown>(null)

  const isDineIn = order.serviceType === 'DINE_IN'
  const isPaid = order.paymentStatus === 'PAID'
  const isUnpaid = order.paymentStatus === 'UNPAID'
  const canPayOrder = isUnpaid && !['COMPLETED', 'CANCELLED'].includes(order.status)
  const canAppend = canSubmitType(access, order.serviceType) && isUnpaid && ['CONFIRMED', 'PREPARING', 'READY', 'SERVED'].includes(order.status)
  const canMarkAllServed = (canMarkServed(access) || access.user?.role === 'OWNER' || canOrder(access, 'ORDER_UPDATE')) && ['CONFIRMED', 'PREPARING', 'READY'].includes(order.status)
  const canComplete = isPaid && order.status === 'SERVED' && (canCompleteOrder(access, order.serviceType) || access.user?.role === 'OWNER')

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!scope || busy) return
    setBusy(true)
    setActionError(null)
    try {
      await ordersApi.confirm(scope, order.id, order.version)
      void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(false)
    }
  }

  const handleMarkServed = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!scope || busy) return
    setBusy(true)
    setActionError(null)
    try {
      await ordersApi.markAllServed(scope, order.id, order.version)
      void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(false)
    }
  }

  const handleComplete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!scope || busy) return
    setBusy(true)
    setActionError(null)
    try {
      await ordersApi.complete(scope, order.id, order.version)
      void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
      if (order.serviceType === 'DINE_IN') {
        void client.invalidateQueries({ queryKey: orderKeys.tables(scope) })
        void client.invalidateQueries({ queryKey: orderKeys.sessions(scope) })
        void client.invalidateQueries({ queryKey: orderKeys.activeOrders(scope) })
      }
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={`pos-order-card status-${order.status.toLowerCase()} pay-${order.paymentStatus.toLowerCase()}`}>
      <div className="pos-card-topbar">
        <div className="pos-card-code-time">
          <Link
            to={'/cashier/orders/' + order.id}
            className="pos-card-code"
            onClick={(e) => {
              if (onOpenDetail) {
                e.preventDefault()
                onOpenDetail(order.id)
              }
            }}
          >
            <span className="pos-hash">#</span>
            <strong>{order.orderCode}</strong>
          </Link>
          <span className="pos-card-time" title={order.createdAt}>
            ⏱ {formatRelativeTime(order.createdAt)}
          </span>
        </div>

        <div className="pos-card-type-badge">
          <span className={`pos-badge pos-badge-${order.serviceType.toLowerCase()}`}>
            {isDineIn ? '🪑 Tại bàn' : '🛍️ Mang đi'}
          </span>
        </div>
      </div>

      <div className="pos-card-customer-row">
        <span className="pos-customer-name">
          👤 {order.customerName || 'Khách vãng lai'}
        </span>
        <span className="order-muted pos-guest-count">
          {order.guestCount} khách
        </span>
      </div>

      <div className="pos-card-badges-row">
        {/* Serving status badge */}
        <span className={`pos-badge pos-badge-status status-${order.status.toLowerCase()}`}>
          {order.status === 'OPEN' && '📝 Nháp'}
          {order.status === 'CONFIRMED' && '⏳ Đã xác nhận'}
          {order.status === 'PREPARING' && '🍳 Đang nấu'}
          {order.status === 'READY' && '🛎 Món sẵn sàng'}
          {order.status === 'SERVED' && '🍽 Đã lên món'}
          {order.status === 'COMPLETED' && '✓ Hoàn tất'}
          {order.status === 'CANCELLED' && '✕ Đã hủy'}
        </span>

        {/* Payment badge */}
        <span className={`pos-badge pos-badge-pay pay-${order.paymentStatus.toLowerCase()}`}>
          {isPaid ? '✓ Đã thanh toán' : 'Chưa thanh toán'}
        </span>

        {/* QR badge only if channel is QR */}
        {order.sourceChannel === 'QR_TABLE' && (
          <span className="pos-badge pos-badge-qr">📱 QR Bàn</span>
        )}
      </div>

      <div className="pos-card-price-row">
        <span className="order-muted">Tổng tiền:</span>
        <strong className="pos-card-total-amount">
          {formatMinor(moneyMinor(order.totalAmount), order.currencyCode)}
        </strong>
      </div>

      {actionError ? <OrderFeedback error={actionError} /> : null}

      <div className="pos-card-actions-row">
        {/* Xác nhận đơn nháp OPEN */}
        {order.status === 'OPEN' && canOrder(access, 'ORDER_UPDATE') && (
          <button
            type="button"
            className="button button-small button-primary"
            disabled={busy}
            onClick={handleConfirm}
          >
            {busy ? 'Đang lưu...' : 'Xác nhận'}
          </button>
        )}

        {/* Lên món: Cập nhật tất cả món thành served */}
        {canMarkAllServed && (
          <button
            type="button"
            className="button button-small button-primary pos-card-served-btn"
            disabled={busy}
            onClick={handleMarkServed}
          >
            {busy ? 'Đang cập nhật...' : '✓ Đã lên món'}
          </button>
        )}

        {/* Hoàn tất đơn khi đã lên món và đã thanh toán */}
        {canComplete && (
          <button
            type="button"
            className="button button-small button-primary pos-card-complete-btn"
            disabled={busy}
            onClick={handleComplete}
          >
            {busy ? 'Đang hoàn tất...' : '✓ Hoàn tất'}
          </button>
        )}

        {/* Thu tiền / Thanh toán cho đơn chưa thanh toán */}
        {canPayOrder && onPay && (
          <button
            type="button"
            className="button button-small button-primary pos-card-pay-btn"
            onClick={(e) => {
              e.preventDefault()
              onPay(order.id)
            }}
          >
            💰 Thanh toán
          </button>
        )}

        {/* Nút Chi tiết mở modal */}
        <button
          type="button"
          className="button button-small button-ghost pos-card-detail-btn"
          onClick={(e) => {
            e.preventDefault()
            onOpenDetail?.(order.id)
          }}
        >
          Chi tiết
        </button>

        {canAppend && onAddItems && (
          <button
            type="button"
            className="button button-small button-ghost"
            onClick={(e) => {
              e.preventDefault()
              onAddItems(order.id)
            }}
          >
            + Gọi thêm
          </button>
        )}
      </div>
    </article>
  )
}

function OrderRows({ criteria }: { criteria: OrderCriteria }) {
  const q = useOrders(criteria)
  return (
    <>
      <OrderFeedback error={q.error} onRetry={() => void q.refetch()} />
      {q.isFetching && <p role="status">Đang tải đơn...</p>}
      {q.data?.content.length === 0 && <p className="order-empty">Không có đơn phù hợp.</p>}
      <div className="order-list-grid">
        {q.data?.content.map((order) => (
          <Link to={'/cashier/orders/' + order.id} key={order.id} className="order-list-card">
            <div>
              <strong>{order.orderCode}</strong>
              <span>{orderLabels[order.serviceType]}</span>
            </div>
            <p>
              {orderLabels[order.status]} · {orderLabels[order.paymentStatus]}
            </p>
            <p>{new Date(order.createdAt).toLocaleString('vi-VN')}</p>
            {order.customerName && <span>{order.customerName}</span>}
            <strong>{formatMinor(moneyMinor(order.totalAmount), order.currencyCode)}</strong>
          </Link>
        ))}
      </div>
    </>
  )
}

export function OrderListPage() {
  const { access, scope } = useOrderAccess()
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()

  const parsed = orderCriteriaSchema.safeParse(
    Object.fromEntries([...params.entries()].map(([k, v]) => [k, ['page', 'size'].includes(k) ? Number(v) : v])),
  )
  const criteria = parsed.success ? parsed.data : orderCriteriaSchema.parse({})

  const [search, setSearch] = useState(params.get('q') ?? '')
  const [activeMobileCol, setActiveMobileCol] = useState<'pending' | 'cooking' | 'ready' | 'history'>('pending')
  const [payOrderId, setPayOrderId] = useState<string | null>(null)
  const [addItemsOrderId, setAddItemsOrderId] = useState<string | null>(null)
  const [selectedOrderFull, setSelectedOrderFull] = useState<Order | null>(null)
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null)
  const [qrSelection, setQrSelection] = useState<{ scope: string; id: string } | null>(null)
  const [qrNotice, setQrNotice] = useState<{ scope: string; message: string; orderId?: string } | null>(null)
  const [qrPagination, setQrPagination] = useState({ filter: '', page: 0 })

  const isHistoryMode = criteria.status === 'COMPLETED' || criteria.status === 'CANCELLED'
  const isTableSessionFiltered = !!criteria.tableSessionId
  const qrFilter = `${scope ?? ''}:${criteria.serviceType ?? ''}:${criteria.tableSessionId ?? ''}`
  const qrPage = qrPagination.filter === qrFilter ? qrPagination.page : 0
  const qrQuery = useQrReviewQueue(
    qrReviewCriteriaSchema.parse({
      page: qrPage,
      entryType:
        criteria.serviceType === 'DINE_IN' ? 'TABLE' : criteria.serviceType === 'TAKEAWAY' ? 'RESTAURANT' : undefined,
      observedSessionId: criteria.tableSessionId,
    }),
    !isHistoryMode,
  )

  // Column queries for 3-Column Kanban
  const confirmedQuery = useOrders({ ...criteria, status: 'CONFIRMED' })
  const openQuery = useOrders({ ...criteria, status: 'OPEN' })
  const preparingQuery = useOrders({ ...criteria, status: 'PREPARING' })
  const readyQuery = useOrders({ ...criteria, status: 'READY' })
  const servedQuery = useOrders({ ...criteria, status: 'SERVED' })

  // Session-specific query when filtering by tableSessionId
  const sessionOrdersQuery = useOrders(criteria)

  // History query for terminal states
  const historyQuery = useOrders(criteria)

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.set('page', '0')
    setParams(next)
  }

  // Refresh all queries
  const handleRefresh = () => {
    void client.invalidateQueries({ queryKey: orderKeys.lists(scope ?? '') })
    void client.invalidateQueries({ queryKey: qrReviewKeys.root(scope) })
  }

  // Open Payment modal
  const handleOpenPay = async (orderId: string) => {
    if (!scope) return
    try {
      const full = await ordersApi.detail(scope, orderId)
      setSelectedOrderFull(full)
      setPayOrderId(orderId)
    } catch {
      // fallback
    }
  }

  // Open Add items modal
  const handleOpenAddItems = async (orderId: string) => {
    if (!scope) return
    try {
      const full = await ordersApi.detail(scope, orderId)
      setSelectedOrderFull(full)
      setAddItemsOrderId(orderId)
    } catch {
      // fallback
    }
  }

  // Partitioned items for columns:
  // Column 1 (Chờ xác nhận): Chỉ đơn OPEN
  // Column 2 (Đang nấu): Đơn CONFIRMED, PREPARING và READY (món đã sẵn sàng vẫn ở Đang nấu)
  // Column 3 (Đã lên món): Chỉ đơn SERVED
  let pendingOrders: OrderSummary[] = []
  let cookingOrders: OrderSummary[] = []
  let readyOrders: OrderSummary[] = []

  if (isTableSessionFiltered) {
    const items = sessionOrdersQuery.data?.content ?? []
    pendingOrders = items.filter((o) => o.status === 'OPEN')
    cookingOrders = items.filter((o) => o.status === 'CONFIRMED' || o.status === 'PREPARING' || o.status === 'READY')
    readyOrders = items.filter((o) => o.status === 'SERVED')
  } else {
    pendingOrders = openQuery.data?.content ?? []
    cookingOrders = [
      ...(confirmedQuery.data?.content ?? []),
      ...(preparingQuery.data?.content ?? []),
      ...(readyQuery.data?.content ?? []),
    ]
    readyOrders = servedQuery.data?.content ?? []
  }

  const draftCount = isTableSessionFiltered
    ? pendingOrders.length
    : (openQuery.data?.totalElements ?? 0)
  const qrCount = qrQuery.data?.totalElements ?? 0
  const pendingCount = draftCount + qrCount

  const cookingCount = isTableSessionFiltered
    ? cookingOrders.length
    : (confirmedQuery.data?.totalElements ?? 0) +
      (preparingQuery.data?.totalElements ?? 0) +
      (readyQuery.data?.totalElements ?? 0)

  const readyCount = isTableSessionFiltered
    ? readyOrders.length
    : (servedQuery.data?.totalElements ?? 0)

  const totalServingCount = draftCount + cookingCount + readyCount

  return (
    <div className="cashier-order pos-orders-management">
      {/* Page Header */}
      <header className="order-panel-heading pos-orders-header">
        <div className="pos-orders-header-title">
          <span className="order-eyebrow">Quản lý phục vụ</span>
          <div className="pos-orders-title-row">
            <h2>Quản lý đơn hàng</h2>
            <span className="pos-orders-total-badge" title="Tổng số đơn đang phục vụ">
              {totalServingCount} đơn đang phục vụ
            </span>
          </div>
        </div>

        <div className="order-actions pos-orders-header-actions">
          <button
            type="button"
            className="button button-ghost"
            onClick={handleRefresh}
            title="Làm mới dữ liệu các cột"
          >
            🔄 Làm mới
          </button>

          <button
            type="button"
            className={`button ${isHistoryMode ? 'button-primary' : 'button-ghost'}`}
            onClick={() => {
              if (isHistoryMode) {
                set('status', '')
              } else {
                set('status', 'COMPLETED')
              }
            }}
          >
            {isHistoryMode ? '← Đơn đang phục vụ' : '📜 Lịch sử đơn'}
          </button>

          {canOrder(access, 'ORDER_CREATE') && (
            <Link className="button button-primary" to="/cashier/pos">
              + Bán hàng (POS)
            </Link>
          )}
        </div>
      </header>

      {qrNotice?.scope === scope && (
        <div className="qr-review-notice" role="status">
          <span>{qrNotice.message}</span>
          {qrNotice.orderId && (
            <button type="button" className="button button-ghost" onClick={() => setDetailOrderId(qrNotice.orderId!)}>
              Xem đơn đã nhận
            </button>
          )}
        </div>
      )}

      {/* Session filter banner */}
      {isTableSessionFiltered && (
        <div className="pos-session-filter-alert" role="status">
          <span>
            Đang lọc theo phiên bàn: <strong>{criteria.tableSessionId}</strong>
          </span>
          <button
            type="button"
            className="button button-small button-ghost"
            onClick={() => set('tableSessionId', '')}
          >
            ✕ Xóa bộ lọc phiên
          </button>
        </div>
      )}

      {/* URL Filter validation error */}
      {!parsed.success && (
        <p role="alert" className="order-feedback">
          Bộ lọc URL không hợp lệ. <button onClick={() => setParams({})}>Xóa bộ lọc</button>
        </p>
      )}

      {/* Filter Toolbar */}
      <form
        className="order-list-filters pos-filters-toolbar"
        onSubmit={(e) => {
          e.preventDefault()
          set('q', search.trim())
        }}
      >
        <label>
          Tìm mã đơn
          <input
            maxLength={100}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="OD-..."
          />
        </label>
        <button type="submit" className="button button-ghost">Tìm</button>

        <label>
          Trạng thái
          <select value={criteria.status ?? ''} onChange={(e) => set('status', e.target.value)}>
            <option value="">Tất cả</option>
            {orderStatusSchema.options.map((s) => (
              <option value={s} key={s}>
                {orderLabels[s]}
              </option>
            ))}
          </select>
        </label>

        <label>
          Loại đơn
          <select value={criteria.serviceType ?? ''} onChange={(e) => set('serviceType', e.target.value)}>
            <option value="">Tất cả</option>
            {serviceTypeSchema.options.map((s) => (
              <option value={s} key={s}>
                {orderLabels[s]}
              </option>
            ))}
          </select>
        </label>

        <label>
          Sắp xếp
          <select value={criteria.sortBy} onChange={(e) => set('sortBy', e.target.value)}>
            {Object.entries({
              createdAt: 'Thời gian tạo',
              updatedAt: 'Cập nhật',
              orderCode: 'Mã đơn',
              totalAmount: 'Tổng tiền',
            }).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label>
          Chiều
          <select value={criteria.direction} onChange={(e) => set('direction', e.target.value)}>
            <option value="desc">Giảm dần</option>
            <option value="asc">Tăng dần</option>
          </select>
        </label>
      </form>

      {/* History Mode View */}
      {isHistoryMode ? (
        <section className="pos-history-view" aria-label="Lịch sử đơn hàng">
          <div className="pos-history-tabs">
            <button
              type="button"
              className={`pos-history-tab ${criteria.status === 'COMPLETED' ? 'active' : ''}`}
              onClick={() => set('status', 'COMPLETED')}
            >
              ✓ Đã hoàn tất ({historyQuery.data?.totalElements ?? 0})
            </button>
            <button
              type="button"
              className={`pos-history-tab ${criteria.status === 'CANCELLED' ? 'active' : ''}`}
              onClick={() => set('status', 'CANCELLED')}
            >
              ✕ Đã hủy
            </button>
          </div>

          <OrderFeedback error={historyQuery.error} onRetry={() => void historyQuery.refetch()} />
          {historyQuery.isFetching && <p role="status">Đang tải lịch sử đơn...</p>}

          <div className="pos-kanban-cards-stack">
            {historyQuery.data?.content.map((order) => (
              <OrderCardItem
                key={order.id}
                order={order}
                onPay={handleOpenPay}
                onAddItems={handleOpenAddItems}
                onOpenDetail={setDetailOrderId}
              />
            ))}
          </div>

          {historyQuery.data?.content.length === 0 && !historyQuery.isFetching && (
            <p className="order-empty">Không có đơn lịch sử nào phù hợp.</p>
          )}

          <OrderPager
            page={historyQuery.data?.page ?? criteria.page}
            totalPages={historyQuery.data?.totalPages ?? 0}
            loading={historyQuery.isFetching}
            onPage={(page) => set('page', String(page))}
          />
        </section>
      ) : (
        /* 3-Column Kanban Board */
        <>
          {/* Mobile Column Navigation Tabs */}
          <nav className="pos-mobile-column-tabs" aria-label="Nhóm cột trên điện thoại">
            <button
              type="button"
              className={`pos-col-tab ${activeMobileCol === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveMobileCol('pending')}
            >
              📦 Chờ xác nhận ({pendingCount})
            </button>
            <button
              type="button"
              className={`pos-col-tab ${activeMobileCol === 'cooking' ? 'active' : ''}`}
              onClick={() => setActiveMobileCol('cooking')}
            >
              ⏱ Đang nấu ({cookingCount})
            </button>
            <button
              type="button"
              className={`pos-col-tab ${activeMobileCol === 'ready' ? 'active' : ''}`}
              onClick={() => setActiveMobileCol('ready')}
            >
              ✓ Đã lên món ({readyCount})
            </button>
          </nav>

          <div className="pos-kanban-board" data-mobile-col={activeMobileCol}>
            {/* Column 1: Chờ xác nhận (OPEN) */}
            <section className="pos-kanban-column col-pending" aria-label="Chờ xử lý">
              <header className="pos-column-header">
                <div className="pos-column-title-group">
                  <span className="pos-column-icon" aria-hidden="true">📦</span>
                  <div>
                    <h3>Chờ xác nhận</h3>
                    <p className="pos-column-subtitle">Yêu cầu QR và đơn nháp cần xử lý</p>
                  </div>
                </div>
                <span className="pos-column-badge">{pendingCount}</span>
              </header>

              <div className="pos-kanban-cards-stack">
                <QrReviewQueue
                  query={qrQuery}
                  page={qrPage}
                  onPage={(page) => setQrPagination({ filter: qrFilter, page })}
                  onReview={(id) => { if (scope) setQrSelection({ scope, id }) }}
                  searching={!!criteria.q}
                />
                {pendingOrders.map((order) => (
                  <OrderCardItem
                    key={order.id}
                    order={order}
                    onPay={handleOpenPay}
                    onAddItems={handleOpenAddItems}
                    onOpenDetail={setDetailOrderId}
                  />
                ))}

                {pendingOrders.length === 0 && qrCount === 0 && !qrQuery.isLoading && !qrQuery.error && (
                  <div className="pos-column-empty">
                    <span>⏱ Không có đơn chờ xác nhận</span>
                  </div>
                )}
              </div>
            </section>

            {/* Column 2: Đang nấu (CONFIRMED + PREPARING) */}
            <section className="pos-kanban-column col-cooking" aria-label="Đang chế biến">
              <header className="pos-column-header">
                <div className="pos-column-title-group">
                  <span className="pos-column-icon" aria-hidden="true">⏱</span>
                  <div>
                    <h3>Đang nấu</h3>
                    <p className="pos-column-subtitle">Bếp đang chế biến</p>
                  </div>
                </div>
                <span className="pos-column-badge">{cookingCount}</span>
              </header>

              <div className="pos-kanban-cards-stack">
                {cookingOrders.map((order) => (
                  <OrderCardItem
                    key={order.id}
                    order={order}
                    onPay={handleOpenPay}
                    onAddItems={handleOpenAddItems}
                    onOpenDetail={setDetailOrderId}
                  />
                ))}

                {cookingOrders.length === 0 && (
                  <div className="pos-column-empty">
                    <span>👨‍🍳 Không có đơn đang nấu</span>
                  </div>
                )}
              </div>
            </section>

            {/* Column 3: Đã lên món (READY + SERVED) */}
            <section className="pos-kanban-column col-ready" aria-label="Sẵn sàng / Đã giao">
              <header className="pos-column-header">
                <div className="pos-column-title-group">
                  <span className="pos-column-icon" aria-hidden="true">✓</span>
                  <div>
                    <h3>Đã lên món</h3>
                    <p className="pos-column-subtitle">Chờ thanh toán</p>
                  </div>
                </div>
                <span className="pos-column-badge">{readyCount}</span>
              </header>

              <div className="pos-kanban-cards-stack">
                {readyOrders.map((order) => (
                  <OrderCardItem
                    key={order.id}
                    order={order}
                    onPay={handleOpenPay}
                    onAddItems={handleOpenAddItems}
                    onOpenDetail={setDetailOrderId}
                  />
                ))}

                {readyOrders.length === 0 && (
                  <div className="pos-column-empty">
                    <span>🍽 Không có đơn chờ thanh toán</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}

      {qrSelection?.scope === scope && (
        <QrReviewModal
          key={`${scope}:${qrSelection.id}`}
          requestId={qrSelection.id}
          onClose={() => setQrSelection(null)}
          onDone={(message, orderId) => {
            if (scope) setQrNotice({ scope, message, orderId })
            setQrSelection(null)
          }}
        />
      )}

      {/* Order Detail Modal */}
      {detailOrderId && (
        <OrderDetailModal
          orderId={detailOrderId}
          onClose={() => setDetailOrderId(null)}
          onOpenPay={(id) => {
            setDetailOrderId(null)
            void handleOpenPay(id)
          }}
          onOpenAddItems={(id) => {
            setDetailOrderId(null)
            void handleOpenAddItems(id)
          }}
          onRefresh={handleRefresh}
        />
      )}

      {/* Payment Modal */}
      {payOrderId && selectedOrderFull && (
        <PaymentModal
          order={selectedOrderFull}
          onClose={() => {
            setPayOrderId(null)
            setSelectedOrderFull(null)
          }}
          onSuccess={() => {
            handleRefresh()
          }}
        />
      )}

      {/* Add Items Modal */}
      {addItemsOrderId && selectedOrderFull && (
        <OrderAddItems
          order={selectedOrderFull}
          onClose={() => {
            setAddItemsOrderId(null)
            setSelectedOrderFull(null)
            handleRefresh()
          }}
        />
      )}
    </div>
  )
}

