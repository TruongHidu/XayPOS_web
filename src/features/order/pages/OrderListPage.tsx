import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useOrders } from '../hooks/useOrders'
import { orderCriteriaSchema, orderStatusSchema, serviceTypeSchema } from '../schemas'
import type { Order, OrderCriteria, OrderSummary } from '../types'
import { useOrderAccess } from '../hooks/useOrderAccess'
import { canOrder, canPayment, canSubmitType } from '../policies/orderAccessPolicy'
import { formatMinor, moneyMinor } from '../../../shared/utils/scaledDecimal'
import { OrderFeedback, OrderPager } from '../components/OrderUi'
import { orderLabels } from '../utils/orderLabels'
import { PaymentModal } from '../../payment/components/PaymentModal'
import { OrderAddItems } from '../components/OrderAddItems'
import { ordersApi } from '../api/ordersApi'
import { useQueryClient } from '@tanstack/react-query'
import { orderKeys } from '../api/orderKeys'
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
}: {
  order: OrderSummary
  onPay?: (orderId: string) => void
  onAddItems?: (orderId: string) => void
}) {
  const { access, scope } = useOrderAccess()
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<unknown>(null)

  const isDineIn = order.serviceType === 'DINE_IN'
  const isPaid = order.paymentStatus === 'PAID'
  const isUnpaid = order.paymentStatus === 'UNPAID'
  const canPayOrder = isUnpaid && canPayment(access) && !['COMPLETED', 'CANCELLED'].includes(order.status)
  const canAppend = canSubmitType(access, order.serviceType) && isUnpaid && ['CONFIRMED', 'PREPARING', 'READY', 'SERVED'].includes(order.status)

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

  return (
    <article className={`pos-order-card status-${order.status.toLowerCase()} pay-${order.paymentStatus.toLowerCase()}`}>
      <div className="pos-card-topbar">
        <div className="pos-card-code-time">
          <Link to={'/cashier/orders/' + order.id} className="pos-card-code">
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
          {order.status === 'SERVED' && '🍽 Đã giao món'}
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
        <Link to={'/cashier/orders/' + order.id} className="button button-small button-ghost">
          Chi tiết
        </Link>

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

        {canPayOrder && onPay && (
          <button
            type="button"
            className="button button-small button-primary pos-card-pay-btn"
            onClick={(e) => {
              e.preventDefault()
              onPay(order.id)
            }}
          >
            💵 Thu tiền
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

  const isHistoryMode = criteria.status === 'COMPLETED' || criteria.status === 'CANCELLED'
  const isTableSessionFiltered = !!criteria.tableSessionId

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

  // Partitioned items for columns
  let pendingOrders: OrderSummary[] = []
  let cookingOrders: OrderSummary[] = []
  let readyOrders: OrderSummary[] = []

  if (isTableSessionFiltered) {
    const items = sessionOrdersQuery.data?.content ?? []
    pendingOrders = items.filter((o) => o.status === 'OPEN' || o.status === 'CONFIRMED')
    cookingOrders = items.filter((o) => o.status === 'PREPARING')
    readyOrders = items.filter((o) => o.status === 'READY' || o.status === 'SERVED')
  } else {
    pendingOrders = [...(openQuery.data?.content ?? []), ...(confirmedQuery.data?.content ?? [])]
    cookingOrders = preparingQuery.data?.content ?? []
    readyOrders = [...(readyQuery.data?.content ?? []), ...(servedQuery.data?.content ?? [])]
  }

  const pendingCount = isTableSessionFiltered
    ? pendingOrders.length
    : (openQuery.data?.totalElements ?? 0) + (confirmedQuery.data?.totalElements ?? 0)

  const cookingCount = isTableSessionFiltered
    ? cookingOrders.length
    : (preparingQuery.data?.totalElements ?? 0)

  const readyCount = isTableSessionFiltered
    ? readyOrders.length
    : (readyQuery.data?.totalElements ?? 0) + (servedQuery.data?.totalElements ?? 0)

  const totalServingCount = pendingCount + cookingCount + readyCount

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
              ⏳ Chờ xử lý ({pendingCount})
            </button>
            <button
              type="button"
              className={`pos-col-tab ${activeMobileCol === 'cooking' ? 'active' : ''}`}
              onClick={() => setActiveMobileCol('cooking')}
            >
              🍳 Đang nấu ({cookingCount})
            </button>
            <button
              type="button"
              className={`pos-col-tab ${activeMobileCol === 'ready' ? 'active' : ''}`}
              onClick={() => setActiveMobileCol('ready')}
            >
              🛎 Sẵn sàng ({readyCount})
            </button>
          </nav>

          <div className="pos-kanban-board" data-mobile-col={activeMobileCol}>
            {/* Column 1: Chờ xử lý (OPEN + CONFIRMED) */}
            <section className="pos-kanban-column col-pending" aria-label="Chờ xử lý">
              <header className="pos-column-header">
                <div className="pos-column-title-group">
                  <span className="pos-column-icon" aria-hidden="true">⏳</span>
                  <h3>Chờ xử lý</h3>
                </div>
                <span className="pos-column-badge">{pendingCount}</span>
              </header>

              <div className="pos-kanban-cards-stack">
                {pendingOrders.map((order) => (
                  <OrderCardItem
                    key={order.id}
                    order={order}
                    onPay={handleOpenPay}
                    onAddItems={handleOpenAddItems}
                  />
                ))}

                {pendingOrders.length === 0 && (
                  <div className="pos-column-empty">
                    <span>⏱ Không có đơn chờ xử lý</span>
                  </div>
                )}
              </div>
            </section>

            {/* Column 2: Đang chế biến (PREPARING) */}
            <section className="pos-kanban-column col-cooking" aria-label="Đang chế biến">
              <header className="pos-column-header">
                <div className="pos-column-title-group">
                  <span className="pos-column-icon" aria-hidden="true">🍳</span>
                  <h3>Đang chế biến</h3>
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
                  />
                ))}

                {cookingOrders.length === 0 && (
                  <div className="pos-column-empty">
                    <span>👨‍🍳 Không có đơn đang nấu</span>
                  </div>
                )}
              </div>
            </section>

            {/* Column 3: Sẵn sàng / Đã giao (READY + SERVED) */}
            <section className="pos-kanban-column col-ready" aria-label="Sẵn sàng / Đã giao">
              <header className="pos-column-header">
                <div className="pos-column-title-group">
                  <span className="pos-column-icon" aria-hidden="true">🛎</span>
                  <h3>Sẵn sàng / Đã giao</h3>
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
                  />
                ))}

                {readyOrders.length === 0 && (
                  <div className="pos-column-empty">
                    <span>🍽 Không có đơn sẵn sàng/đã giao</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
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
