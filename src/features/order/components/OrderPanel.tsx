import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Order, OrderLine } from '../types'
import {
  editable,
  appendable,
  cancellable,
  confirmable,
  lineCancellable,
  lineCancelPermission,
  payable,
  completable,
  markAllReadyAllowed,
  markAllServedAllowed,
  allLiveItemsServed,
  isServingOrder,
} from '../policies/orderActionPolicy'
import {
  canCloseTable,
  canCompleteOrder,
  canKitchen,
  canMarkServed,
  canMenu,
  canOrder,
  canPayment,
  canSubmitType,
  canViewPayment,
} from '../policies/orderAccessPolicy'
import { orderError } from '../utils/orderErrors'
import { useOrderAccess } from '../hooks/useOrderAccess'
import { formatMinor, moneyMinor } from '../../../shared/utils/scaledDecimal'
import { OrderFeedback } from './OrderUi'
import { orderLabels } from '../utils/orderLabels'
import { OrderEditor } from './OrderEditor'
import { OrderAddItems } from './OrderAddItems'
import type { EditorKind } from '../utils/orderCommands'
import { ordersApi } from '../api/ordersApi'
import { orderKeys } from '../api/orderKeys'
import { cacheOrderSnapshot } from '../api/orderSnapshot'
import { operationKey, verifyOrder, useOrderOperationState } from '../store/orderOperationState'
import { useOrderDraftStore } from '../store/orderDraftStore'
import { isLineAppended } from '../utils/orderAppended'
import { PaymentModal } from '../../payment/components/PaymentModal'
import { paymentsApi } from '../../payment/api/paymentsApi'
import { cashierTablesApi } from '../../tables/api/cashierTablesApi'
import { useOrderDetail } from '../hooks/useOrderDetail'

export function OrderPanel({ order: propOrder, onReload }: { order: Order; onReload?: (order: Order) => void }) {
  const liveQuery = useOrderDetail(propOrder.id, propOrder)
  const currentOrder = liveQuery.data && liveQuery.data.version > propOrder.version ? liveQuery.data : propOrder
  const [localOrder, setLocalOrder] = useState<Order | null>(null)
  const order =
    localOrder && localOrder.id === currentOrder.id && localOrder.version >= currentOrder.version
      ? localOrder
      : currentOrder

  const { access, scope } = useOrderAccess()
  const client = useQueryClient()
  const key = scope ? operationKey(scope, order.id) : ''
  const busy = useOrderOperationState((s) => s.busy.has(key))
  const uncertain = useOrderOperationState((s) => s.uncertain.has(key))
  const refusal = useOrderOperationState((s) => s.refusals.get(key))
  const appendIntent = useOrderOperationState((s) => s.appends.get(key))
  const blocked = uncertain || !!refusal

  const [editor, setEditor] = useState<{ kind: EditorKind; baseline: Order; line?: OrderLine } | null>(null)
  const [add, setAdd] = useState<Order | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [showPaymentsHistory, setShowPaymentsHistory] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [actionBusy, setActionBusy] = useState(false)

  const update = canOrder(access, 'ORDER_UPDATE') && editable(order)
  const cancel = canOrder(access, 'ORDER_CANCEL') && cancellable(order)
  const canPay = payable(order) && canPayment(access)
  const canBulkReady = canKitchen(access, 'KITCHEN_MARK_READY') && markAllReadyAllowed(order)
  const canBulkServed = canMarkServed(access) && markAllServedAllowed(order)
  const canComplete = completable(order) && canCompleteOrder(access, order.serviceType)
  const allServed = allLiveItemsServed(order)

  // Payments query
  const paymentsQuery = useQuery({
    queryKey: ['cashier', scope, 'payments', order.id],
    queryFn: ({ signal }) => paymentsApi.list(scope!, order.id, { page: 0, size: 20 }, signal),
    enabled: !!scope && showPaymentsHistory && canViewPayment(access),
    retry: false,
  })

  const syncState = (updated: Order) => {
    setLocalOrder(updated)
    const draft = useOrderDraftStore.getState()
    if (draft.scope === scope && draft.result?.id === updated.id) {
      useOrderDraftStore.setState({ result: updated })
    }
  }

  const reload = async (keepError = false) => {
    if (!scope || !canOrder(access, 'ORDER_VIEW')) return
    try {
      const latest = await ordersApi.detail(scope, order.id)
      cacheOrderSnapshot(client, scope, latest)
      verifyOrder(key)
      syncState(latest)
      if (!keepError) setError(null)
      onReload?.(latest)
    } catch (e) {
      setError(e)
    }
  }

  const start = (kind: EditorKind, line?: OrderLine) => setEditor({ kind, baseline: order, line })

  // Item lifecycle transitions
  const handleItemTransition = async (lineId: string, action: 'start-cooking' | 'mark-ready' | 'mark-served') => {
    if (!scope || busy || actionBusy) return
    setError(null)
    setActionBusy(true)
    try {
      let updated: Order
      if (action === 'start-cooking') {
        updated = await ordersApi.startCooking(scope, order.id, lineId, order.version)
      } else if (action === 'mark-ready') {
        updated = await ordersApi.markReady(scope, order.id, lineId, order.version)
      } else {
        updated = await ordersApi.markServed(scope, order.id, lineId, order.version)
      }
      cacheOrderSnapshot(client, scope, updated)
      syncState(updated)
      void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
      onReload?.(updated)
    } catch (e) {
      setError(e)
      const err = orderError(e)
      if (err.status === 409) {
        void reload(true)
      }
    } finally {
      setActionBusy(false)
    }
  }

  // Bulk mark ready
  const handleMarkAllReady = async () => {
    if (!scope || busy || actionBusy) return
    setError(null)
    setActionBusy(true)
    try {
      const updated = await ordersApi.markAllReady(scope, order.id, order.version)
      cacheOrderSnapshot(client, scope, updated)
      syncState(updated)
      void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
      onReload?.(updated)
    } catch (e) {
      setError(e)
      const err = orderError(e)
      if (err.status === 409) {
        void reload(true)
      }
    } finally {
      setActionBusy(false)
    }
  }

  // Bulk mark served
  const handleMarkAllServed = async () => {
    if (!scope || busy || actionBusy) return
    setError(null)
    setActionBusy(true)
    try {
      const updated = await ordersApi.markAllServed(scope, order.id, order.version)
      cacheOrderSnapshot(client, scope, updated)
      syncState(updated)
      void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
      onReload?.(updated)
    } catch (e) {
      setError(e)
      const err = orderError(e)
      if (err.status === 409) {
        void reload(true)
      }
    } finally {
      setActionBusy(false)
    }
  }

  // Complete order
  const handleCompleteOrder = async () => {
    if (!scope || busy || actionBusy) return
    setError(null)
    setActionBusy(true)
    try {
      const updated = await ordersApi.complete(scope, order.id, order.version)
      cacheOrderSnapshot(client, scope, updated)
      syncState(updated)
      void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
      if (order.serviceType === 'DINE_IN') {
        void client.invalidateQueries({ queryKey: orderKeys.tables(scope) })
        void client.invalidateQueries({ queryKey: orderKeys.sessions(scope) })
        void client.invalidateQueries({ queryKey: orderKeys.activeOrders(scope) })
      }
      onReload?.(updated)
    } catch (e) {
      setError(e)
      const err = orderError(e)
      if (err.status === 409) {
        void reload(true)
      }
    } finally {
      setActionBusy(false)
    }
  }

  // Close session
  const handleCloseSession = async () => {
    if (!scope || !order.tableSessionId || busy || actionBusy) return
    setError(null)
    setActionBusy(true)
    try {
      const session = await cashierTablesApi.session(scope, order.tableSessionId)
      await cashierTablesApi.close(scope, order.tableSessionId, session.version)
      void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
      void client.invalidateQueries({ queryKey: ['cashier', scope, 'tables'] })
      await reload()
    } catch (e) {
      setError(e)
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <section className="cashier-order order-detail">
      <div className="order-panel-heading">
        <div>
          <span className="order-eyebrow">
            {order.serviceType === 'TAKEAWAY' ? 'Đơn mang đi' : 'Đơn tại bàn'} · {order.id.slice(0, 8)}
          </span>
          <h2>{order.orderCode}</h2>
        </div>
        <div className="order-actions">
          <button type="button" className="button button-ghost" onClick={() => window.print()}>
            🖨 In hóa đơn
          </button>
          {canOrder(access, 'ORDER_VIEW') && (
            <button className="button button-ghost" type="button" disabled={busy} onClick={() => void reload()}>
              Tải lại đơn
            </button>
          )}
        </div>
      </div>

      <OrderFeedback error={error} />
      <OrderFeedback error={refusal} />
      {uncertain && (
        <p role="alert" className="order-warning">
          Đơn đã thay đổi hoặc kết quả chưa xác định. Tải lại để đối chiếu trước thao tác mới.
        </p>
      )}

      <div className="order-badges">
        <span className={`pos-badge pos-badge-${order.serviceType.toLowerCase()}`}>
          {orderLabels[order.serviceType]}
        </span>
        <span className={`pos-badge pos-badge-status-${order.status.toLowerCase()}`}>{orderLabels[order.status]}</span>
        <span className={`pos-badge pos-badge-pay-${order.paymentStatus.toLowerCase()}`}>
          {orderLabels[order.paymentStatus]}
        </span>
        {order.sourceChannel === 'QR_TABLE' && <span className="pos-badge pos-badge-qr">📱 QR Bàn</span>}
      </div>

      <div className="pos-order-meta-grid">
        <div className="pos-meta-item">
          <span className="order-muted">Thời gian tạo:</span>
          <strong>{new Date(order.createdAt).toLocaleString('vi-VN')}</strong>
        </div>
        <div className="pos-meta-item">
          <span className="order-muted">Số khách:</span>
          <strong>{order.guestCount} khách</strong>
        </div>
        {order.customerName && (
          <div className="pos-meta-item">
            <span className="order-muted">Khách hàng:</span>
            <strong>
              {order.customerName} {order.customerPhone ? `(${order.customerPhone})` : ''}
            </strong>
          </div>
        )}
        {order.tableSessionId && (
          <div className="pos-meta-item">
            <span className="order-muted">Mã phiên bàn:</span>
            <span>{order.tableSessionId.slice(0, 8)}...</span>
          </div>
        )}
        {order.note && (
          <div className="pos-meta-item full-width">
            <span className="order-muted">Ghi chú:</span>
            <p>{order.note}</p>
          </div>
        )}
        {order.cancelReason && (
          <div className="pos-meta-item full-width pos-cancel-note">
            <span className="order-muted">Lý do hủy:</span>
            <p>{order.cancelReason}</p>
          </div>
        )}
      </div>

      {/* Lines list */}
      <div className="order-detail-lines">
        <div
          className="pos-lines-header-row"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '12px',
          }}
        >
          <h4 style={{ margin: 0 }}>Danh sách món ({order.items.length})</h4>
          <div className="order-actions pos-lines-bulk-actions" style={{ margin: 0 }}>
            {canBulkReady && (
              <button
                type="button"
                className="button button-small button-ghost pos-btn-bulk-ready"
                disabled={busy || actionBusy || blocked}
                onClick={() => void handleMarkAllReady()}
              >
                {actionBusy ? 'Đang xử lý...' : '🛎 Sẵn sàng tất cả'}
              </button>
            )}
            {canBulkServed && (
              <button
                type="button"
                className="button button-small button-primary pos-btn-bulk-served"
                disabled={busy || actionBusy || blocked}
                onClick={() => void handleMarkAllServed()}
              >
                {actionBusy ? 'Đang xử lý...' : '🍽 Đã phục vụ tất cả'}
              </button>
            )}
            {allServed && !canBulkServed && isServingOrder(order) && (
              <span className="pos-badge pos-badge-status-served" title="Tất cả món đã được phục vụ">
                ✓ Đã phục vụ đủ món
              </span>
            )}
          </div>
        </div>
        {order.items.map((line) => {
          const appended = isLineAppended(order, line)
          return (
            <article
              className={'order-detail-line ' + (line.status === 'CANCELLED' ? 'is-cancelled' : '')}
              key={line.id}
            >
              <div>
                <div>
                  <strong>{line.itemName}</strong>
                  {appended && (
                    <span className="pos-item-appended-badge" title="Món gọi thêm">
                      ➕ Gọi thêm
                    </span>
                  )}
                  <span className={`pos-item-status-badge status-${line.status.toLowerCase()}`}>
                    {orderLabels[line.status]}
                  </span>
                </div>
                <strong className="pos-line-total">
                  {formatMinor(moneyMinor(line.lineTotal), order.currencyCode)}
                </strong>
              </div>

              <p className="order-muted">
                {line.quantity} {line.unit} × {formatMinor(moneyMinor(line.unitPrice), order.currencyCode)}
              </p>

              {line.note && <p className="pos-line-note">Ghi chú: {line.note}</p>}
              {line.cancelReason && <p className="pos-line-note cancel">Lý do hủy: {line.cancelReason}</p>}

              <div className="order-actions pos-line-ops">
                {/* Kitchen transitions */}
                {line.status === 'PENDING' && canKitchen(access, 'KITCHEN_START_COOKING') && (
                  <button
                    type="button"
                    className="button button-small button-ghost"
                    disabled={busy || actionBusy}
                    onClick={() => void handleItemTransition(line.id, 'start-cooking')}
                  >
                    🍳 Bắt đầu nấu
                  </button>
                )}
                {line.status === 'COOKING' && canKitchen(access, 'KITCHEN_MARK_READY') && (
                  <button
                    type="button"
                    className="button button-small button-ghost"
                    disabled={busy || actionBusy}
                    onClick={() => void handleItemTransition(line.id, 'mark-ready')}
                  >
                    🛎 Món sẵn sàng
                  </button>
                )}
                {line.status === 'READY' && canMarkServed(access) && (
                  <button
                    type="button"
                    className="button button-small button-primary"
                    disabled={busy || actionBusy}
                    onClick={() => void handleItemTransition(line.id, 'mark-served')}
                  >
                    🍽 Giao món
                  </button>
                )}

                {/* Edit / cancel line */}
                {update && line.status === 'PENDING' && (
                  <button type="button" disabled={busy || blocked} onClick={() => start('line', line)}>
                    Sửa món
                  </button>
                )}
                {lineCancellable(order, line) && canOrder(access, lineCancelPermission(order)) && (
                  <button type="button" disabled={busy || blocked} onClick={() => start('cancelLine', line)}>
                    Hủy món
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {/* Totals */}
      <dl className="order-totals">
        {(
          [
            ['Tiền hàng', order.subtotalAmount],
            ['Giảm giá', order.discountAmount],
            ['Thuế', order.taxAmount],
            ['Phí phục vụ', order.serviceChargeAmount],
            ['Tổng phải trả', order.totalAmount],
            ['Đã trả', order.paidAmount],
          ] as const
        ).map(([label, amount]) => (
          <div key={label} className={label === 'Tổng phải trả' ? 'is-grand-total' : ''}>
            <dt>{label}</dt>
            <dd>{formatMinor(moneyMinor(amount), order.currencyCode)}</dd>
          </div>
        ))}
      </dl>

      {/* Order Level Actions */}
      <div className="order-actions pos-panel-primary-actions">
        {/* Thu tiền */}
        {canPay && (
          <button
            className="button button-primary pos-btn-pay"
            type="button"
            disabled={busy || blocked}
            onClick={() => setShowPayment(true)}
          >
            💵 Thu tiền ({formatMinor(moneyMinor(order.totalAmount), order.currencyCode)})
          </button>
        )}

        {/* Gọi thêm món */}
        {canSubmitType(access, order.serviceType) && appendable(order) && canMenu(access) && (
          <button className="button button-ghost" disabled={busy || blocked} onClick={() => setAdd(order)}>
            Thêm món
          </button>
        )}

        {/* Sửa thông tin */}
        {update && (
          <button className="button button-ghost" disabled={busy || blocked} onClick={() => start('metadata')}>
            Sửa thông tin
          </button>
        )}

        {/* Xác nhận đơn nháp */}
        {canOrder(access, 'ORDER_UPDATE') && confirmable(order) && (
          <button className="button button-primary" disabled={busy || blocked} onClick={() => start('confirm')}>
            Xác nhận đơn
          </button>
        )}

        {/* Sẵn sàng tất cả */}
        {canBulkReady && (
          <button
            className="button button-ghost pos-btn-bulk-ready"
            type="button"
            disabled={busy || actionBusy || blocked}
            onClick={() => void handleMarkAllReady()}
          >
            {actionBusy ? 'Đang xử lý...' : '🛎 Sẵn sàng tất cả'}
          </button>
        )}

        {/* Đã phục vụ tất cả */}
        {canBulkServed && (
          <button
            className="button button-primary pos-btn-bulk-served"
            type="button"
            disabled={busy || actionBusy || blocked}
            onClick={() => void handleMarkAllServed()}
          >
            {actionBusy ? 'Đang xử lý...' : '🍽 Đã phục vụ tất cả'}
          </button>
        )}

        {/* Hoàn tất đơn */}
        {canComplete && (
          <button
            className="button button-primary pos-btn-complete"
            disabled={busy || actionBusy || blocked}
            onClick={() => void handleCompleteOrder()}
          >
            {actionBusy ? 'Đang xử lý...' : '✓ Hoàn tất đơn'}
          </button>
        )}

        {/* Đóng bàn */}
        {order.tableSessionId && order.status === 'COMPLETED' && canCloseTable(access) && (
          <button
            className="button button-ghost"
            disabled={busy || actionBusy}
            onClick={() => void handleCloseSession()}
          >
            Đóng phiên bàn
          </button>
        )}

        {/* Hủy đơn */}
        {cancel && (
          <button className="button button-ghost" disabled={busy || blocked} onClick={() => start('cancel')}>
            Hủy đơn
          </button>
        )}

        {/* Replay append */}
        {appendIntent && !refusal && (
          <button className="button button-primary" disabled={busy} onClick={() => setAdd(order)}>
            Kiểm tra yêu cầu gọi thêm
          </button>
        )}

        {/* View payments history */}
        {canViewPayment(access) && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => setShowPaymentsHistory(!showPaymentsHistory)}
          >
            {showPaymentsHistory ? 'Ẩn lịch sử thanh toán' : 'Xem lịch sử thanh toán'}
          </button>
        )}
      </div>

      {/* Payments history section */}
      {showPaymentsHistory && (
        <div className="pos-payments-history-section">
          <h4>Lịch sử giao dịch thanh toán</h4>
          {paymentsQuery.isFetching && <p role="status">Đang tải lịch sử thanh toán...</p>}
          <OrderFeedback error={paymentsQuery.error} onRetry={() => void paymentsQuery.refetch()} />
          {paymentsQuery.data?.content.length === 0 && (
            <p className="order-muted">Chưa có giao dịch thanh toán nào được ghi nhận cho đơn này.</p>
          )}
          {paymentsQuery.data?.content.map((p) => (
            <div key={p.id} className="pos-payment-history-card">
              <div>
                <strong>{p.paymentCode}</strong>
                <span>{p.paymentMethod === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}</span>
              </div>
              <p>
                {formatMinor(moneyMinor(p.amount), p.currencyCode)} · {p.status}
              </p>
              {p.referenceNo && <small>Mã giao dịch: {p.referenceNo}</small>}
              {p.paidAt && <small>{new Date(p.paidAt).toLocaleString('vi-VN')}</small>}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {editor && (
        <OrderEditor order={editor.baseline} kind={editor.kind} line={editor.line} onClose={() => setEditor(null)} />
      )}
      {add && <OrderAddItems order={add} onClose={() => setAdd(null)} />}
      {showPayment && (
        <PaymentModal
          order={order}
          onClose={() => setShowPayment(false)}
          onSuccess={(updated) => {
            onReload?.(updated)
          }}
        />
      )}
    </section>
  )
}
