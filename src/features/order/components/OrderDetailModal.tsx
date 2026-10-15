import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Order } from '../types'
import { ordersApi } from '../api/ordersApi'
import { orderKeys } from '../api/orderKeys'
import { useOrderAccess } from '../hooks/useOrderAccess'
import {
  canMarkServed,
  canCompleteOrder,
  canSubmitType,
  canOrder,
} from '../policies/orderAccessPolicy'
import {
  cancellable,
  appendable,
  liveItems,
} from '../policies/orderActionPolicy'
import { formatMinor, moneyMinor } from '../../../shared/utils/scaledDecimal'
import { orderError } from '../utils/orderErrors'
import { OrderFeedback } from './OrderUi'

interface OrderDetailModalProps {
  orderId: string
  onClose: () => void
  onOpenPay?: (orderId: string) => void
  onOpenAddItems?: (orderId: string) => void
  onRefresh?: () => void
}

export function OrderDetailModal({
  orderId,
  onClose,
  onOpenPay,
  onOpenAddItems,
  onRefresh,
}: OrderDetailModalProps) {
  const { access, scope } = useOrderAccess()
  const client = useQueryClient()

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<unknown>(null)

  // Fetch full order detail
  const {
    data: fetchedOrder,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: orderKeys.detail(scope, orderId),
    queryFn: ({ signal }) => ordersApi.detail(scope!, orderId, signal),
    enabled: Boolean(scope && orderId),
    retry: false,
  })

  const [localOrder, setLocalOrder] = useState<Order | null>(null)
  const order =
    localOrder && localOrder.id === orderId && localOrder.version >= (fetchedOrder?.version ?? 0)
      ? localOrder
      : fetchedOrder

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (isLoading || !order) {
    const loadingNode = (
      <div className="pos-detail-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <div className="pos-detail-modal" role="dialog" aria-modal="true" aria-label="Chi tiết đơn hàng">
          <div className="pos-modal-header">
            <h3>Chi tiết đơn hàng</h3>
            <button type="button" className="pos-modal-close" onClick={onClose} aria-label="Đóng">✕</button>
          </div>
          <div className="pos-modal-body" style={{ padding: '32px', textAlign: 'center' }}>
            {queryError ? <OrderFeedback error={queryError} onRetry={() => void refetch()} /> : <p>Đang tải chi tiết đơn...</p>}
          </div>
        </div>
      </div>
    )
    return typeof document !== 'undefined' ? createPortal(loadingNode, document.body) : loadingNode
  }

  const isDineIn = order.serviceType === 'DINE_IN'
  const isPaid = order.paymentStatus === 'PAID'
  const canPay = !isPaid && !['COMPLETED', 'CANCELLED'].includes(order.status)
  const canAppend = canSubmitType(access, order.serviceType) && appendable(order)

  const activeItems = liveItems(order)
  const allServed = activeItems.length > 0 && activeItems.every((i) => i.status === 'SERVED')
  const canMarkAllServed =
    (canMarkServed(access) || access.user?.role === 'OWNER' || canOrder(access, 'ORDER_UPDATE')) &&
    ['CONFIRMED', 'PREPARING', 'READY'].includes(order.status) &&
    !allServed

  const canComplete =
    isPaid &&
    moneyMinor(order.paidAmount) === moneyMinor(order.totalAmount) &&
    allServed &&
    order.status !== 'COMPLETED' &&
    order.status !== 'CANCELLED' &&
    canCompleteOrder(access, order.serviceType)

  const canCancel = cancellable(order) && canOrder(access, 'ORDER_CANCEL')

  // Action: Mark all items served
  const handleMarkServed = async () => {
    if (!scope || busy) return
    setBusy(true)
    setActionError(null)
    try {
      const updated = await ordersApi.markAllServed(scope, order.id, order.version)
      setLocalOrder(updated)
      client.setQueryData(orderKeys.detail(scope, order.id), updated)
      void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
      onRefresh?.()
    } catch (err) {
      setActionError(err)
      const e = orderError(err)
      if (e.status === 409) {
        void refetch()
      }
    } finally {
      setBusy(false)
    }
  }

  // Action: Complete order
  const handleComplete = async () => {
    if (!scope || busy) return
    setBusy(true)
    setActionError(null)
    try {
      const updated = await ordersApi.complete(scope, order.id, order.version)
      setLocalOrder(updated)
      client.setQueryData(orderKeys.detail(scope, order.id), updated)
      void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
      if (order.serviceType === 'DINE_IN') {
        void client.invalidateQueries({ queryKey: orderKeys.tables(scope) })
        void client.invalidateQueries({ queryKey: orderKeys.sessions(scope) })
        void client.invalidateQueries({ queryKey: orderKeys.activeOrders(scope) })
      }
      onRefresh?.()
      onClose()
    } catch (err) {
      setActionError(err)
      const e = orderError(err)
      if (e.status === 409) {
        void refetch()
      }
    } finally {
      setBusy(false)
    }
  }

  // Action: Cancel order
  const handleCancelOrder = async () => {
    if (!scope || busy) return
    if (!window.confirm('Bạn có chắc chắn muốn hủy đơn hàng này?')) return
    setBusy(true)
    setActionError(null)
    try {
      const updated = await ordersApi.cancel(scope, order.id, {
        expectedVersion: order.version,
        reason: 'Khách yêu cầu hủy',
      })
      setLocalOrder(updated)
      client.setQueryData(orderKeys.detail(scope, order.id), updated)
      void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
      onRefresh?.()
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(false)
    }
  }

  const modalNode = (
    <div
      className="pos-detail-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="pos-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-order-title"
      >
        {/* Header */}
        <div className="pos-modal-header">
          <div className="pos-modal-title-row">
            <h3 id="modal-order-title">Đơn #{order.orderCode}</h3>
            <span className={`pos-badge pos-badge-status status-${order.status.toLowerCase()}`}>
              {['CONFIRMED', 'PREPARING'].includes(order.status) && 'Đang làm'}
              {order.status === 'READY' && 'Sẵn sàng'}
              {order.status === 'SERVED' && 'Đã lên món'}
              {order.status === 'COMPLETED' && 'Đã hoàn tất'}
              {order.status === 'CANCELLED' && 'Đã hủy'}
              {order.status === 'OPEN' && 'Chờ xác nhận'}
            </span>
            <span className={`pos-badge pos-badge-${order.serviceType.toLowerCase()}`}>
              {isDineIn ? '🪑 Tại bàn' : '🛍️ Mang đi'}
            </span>
          </div>
          <button
            type="button"
            className="pos-modal-close"
            onClick={onClose}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {actionError ? (
          <div style={{ padding: '0 20px', marginTop: '12px' }}>
            <OrderFeedback error={actionError} />
          </div>
        ) : null}

        {/* Info Grid */}
        <div className="pos-modal-info-grid">
          <div className="pos-modal-info-cell">
            <span className="order-muted">Mã đơn</span>
            <strong>{order.orderCode}</strong>
          </div>
          <div className="pos-modal-info-cell">
            <span className="order-muted">Tạo lúc</span>
            <span>
              {new Date(order.createdAt).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              {new Date(order.createdAt).toLocaleDateString('vi-VN')}
            </span>
          </div>
          <div className="pos-modal-info-cell">
            <span className="order-muted">Loại đơn</span>
            <span>{isDineIn ? '🪑 Tại bàn' : '🛍️ Mang đi'}</span>
          </div>
          {order.customerName && (
            <div className="pos-modal-info-cell">
              <span className="order-muted">Khách hàng</span>
              <span>
                {order.customerName} {order.customerPhone ? `(${order.customerPhone})` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Danh sách món */}
        <div className="pos-modal-items-section">
          <h4>Danh sách món</h4>
          <div className="pos-modal-items-list">
            {order.items.map((line) => (
              <div
                key={line.id}
                className={`pos-modal-item-row ${line.status === 'CANCELLED' ? 'is-cancelled' : ''}`}
              >
                <div className="pos-modal-item-left">
                  <span className="pos-modal-item-qty">{line.quantity}×</span>
                  <div className="pos-modal-item-meta">
                    <strong>{line.itemName}</strong>
                    {line.note && (
                      <span className="pos-modal-item-note">Ghi chú: {line.note}</span>
                    )}
                    {line.cancelReason && (
                      <span className="pos-modal-item-note text-danger">
                        Lý do hủy: {line.cancelReason}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pos-modal-item-middle">
                  <span className={`pos-badge-sm pos-badge-${line.status.toLowerCase()}`}>
                    {line.status === 'COOKING' && 'Đang nấu'}
                    {line.status === 'PENDING' && 'Chờ nấu'}
                    {line.status === 'READY' && 'Sẵn sàng'}
                    {line.status === 'SERVED' && 'Đã lên'}
                    {line.status === 'CANCELLED' && 'Đã hủy'}
                  </span>
                </div>

                <div className="pos-modal-item-right">
                  <strong>
                    {formatMinor(moneyMinor(line.lineTotal), order.currencyCode)}
                  </strong>
                  <span className="order-muted pos-modal-item-unitprice">
                    {formatMinor(moneyMinor(line.unitPrice), order.currencyCode)}/món
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals Summary */}
        <div className="pos-modal-totals-section">
          <div className="pos-modal-total-row">
            <span className="order-muted">Tạm tính</span>
            <span>
              {formatMinor(moneyMinor(order.subtotalAmount), order.currencyCode)}
            </span>
          </div>
          {order.discountAmount > 0 && (
            <div className="pos-modal-total-row text-success">
              <span>Giảm giá</span>
              <span>
                -{formatMinor(moneyMinor(order.discountAmount), order.currencyCode)}
              </span>
            </div>
          )}
          {order.taxAmount > 0 && (
            <div className="pos-modal-total-row">
              <span className="order-muted">Thuế</span>
              <span>
                {formatMinor(moneyMinor(order.taxAmount), order.currencyCode)}
              </span>
            </div>
          )}
          <div className="pos-modal-total-row is-grand">
            <strong>Tổng cộng</strong>
            <strong className="pos-modal-grand-amount">
              {formatMinor(moneyMinor(order.totalAmount), order.currencyCode)}
            </strong>
          </div>
          <div className="pos-modal-payment-status-row">
            <span className="order-muted">Trạng thái thanh toán:</span>
            <span className={`pos-badge pos-badge-pay pay-${order.paymentStatus.toLowerCase()}`}>
              {isPaid ? '✓ Đã thanh toán' : 'Chưa thanh toán'}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pos-modal-actions-footer">
          <div className="pos-modal-footer-left">
            {canMarkAllServed && (
              <button
                type="button"
                className="pos-btn-outline-green"
                disabled={busy}
                onClick={handleMarkServed}
              >
                {busy ? 'Đang xử lý...' : '✓ Đã lên món'}
              </button>
            )}

            {canCancel && (
              <button
                type="button"
                className="pos-btn-outline-red"
                disabled={busy}
                onClick={handleCancelOrder}
              >
                ✕ Đã huỷ
              </button>
            )}
          </div>

          <div className="pos-modal-footer-right">
            {canAppend && onOpenAddItems && (
              <button
                type="button"
                className="pos-btn-outline-green"
                disabled={busy}
                onClick={() => onOpenAddItems(order.id)}
              >
                + Gọi thêm món
              </button>
            )}

            {canPay && onOpenPay && (
              <button
                type="button"
                className="pos-btn-solid-green"
                disabled={busy}
                onClick={() => onOpenPay(order.id)}
              >
                💰 Thanh toán {formatMinor(moneyMinor(order.totalAmount), order.currencyCode)}
              </button>
            )}

            {canComplete && (
              <button
                type="button"
                className="pos-btn-solid-green pos-btn-complete-modal"
                disabled={busy}
                onClick={handleComplete}
              >
                {busy ? 'Đang xử lý...' : '✓ Hoàn thành'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode
}
