import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Order } from '../../order/types'
import type { Payment, PaymentInput } from '../schemas'
import { paymentsApi } from '../api/paymentsApi'
import { ordersApi } from '../../order/api/ordersApi'
import { orderKeys } from '../../order/api/orderKeys'
import { useOrderAccess } from '../../order/hooks/useOrderAccess'
import { canPayment } from '../../order/policies/orderAccessPolicy'
import { formatMinor, moneyMinor } from '../../../shared/utils/scaledDecimal'
import { newOrderId } from '../../order/utils/orderId'
import { orderError } from '../../order/utils/orderErrors'
import { Modal } from '../../../shared/components/AdminUi'
import { OrderFeedback } from '../../order/components/OrderUi'
import { ReceiptPrint } from '../../order/components/ReceiptPrint'

interface PaymentIntent {
  orderId: string
  input: PaymentInput
  key: string
}

export function PaymentModal({
  order,
  onClose,
  onSuccess,
}: {
  order: Order
  onClose: () => void
  onSuccess?: (order: Order, payment: Payment) => void
}) {
  const { access, scope } = useOrderAccess()
  const client = useQueryClient()
  const allowed = canPayment(access)

  const [method, setMethod] = useState<'CASH' | 'TRANSFER'>('CASH')
  const [cashGiven, setCashGiven] = useState<string>('')
  const [referenceNo, setReferenceNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [uncertain, setUncertain] = useState(false)
  const [intent, setIntent] = useState<PaymentIntent | null>(null)
  const [paidPayment, setPaidPayment] = useState<Payment | null>(null)
  const [latestOrder, setLatestOrder] = useState<Order>(order)

  const totalMinor = moneyMinor(order.totalAmount)
  const currency = order.currencyCode || 'VND'

  // Calculate change for cash payment
  const givenNum = cashGiven.replace(/\D/g, '')
  const givenMinor = givenNum ? BigInt(givenNum) * 100n : 0n
  const isGivenEntered = givenNum.length > 0
  const isInsufficient = isGivenEntered && givenMinor < totalMinor
  const changeMinor = isGivenEntered && givenMinor >= totalMinor ? givenMinor - totalMinor : 0n

  const quickAmounts = [
    Number(totalMinor / 100n),
    50000,
    100000,
    200000,
    500000,
  ].filter((v, i, a) => v >= Number(totalMinor / 100n) && a.indexOf(v) === i)

  const handleRecordPayment = async (retry = false) => {
    if (!scope || !allowed || busy) return
    setError(null)
    setBusy(true)

    try {
      let currentIntent = intent
      if (!retry || !currentIntent) {
        if (method === 'TRANSFER' && !referenceNo.trim()) {
          setError(new Error('Vui lòng nhập mã giao dịch tham chiếu.'))
          setBusy(false)
          return
        }

        const input: PaymentInput = {
          expectedOrderVersion: order.version,
          paymentMethod: method,
          amount: order.totalAmount,
          referenceNo: method === 'TRANSFER' ? referenceNo.trim() : undefined,
        }
        currentIntent = {
          orderId: order.id,
          input,
          key: newOrderId(),
        }
        setIntent(currentIntent)
      }

      const res = await paymentsApi.record(
        scope,
        currentIntent.orderId,
        currentIntent.input,
        currentIntent.key,
      )

      // Fetch authoritative updated order
      let updated = order
      try {
        updated = await ordersApi.detail(scope, order.id)
        setLatestOrder(updated)
      } catch {
        // Keep payment confirmed even if order refetch fails
      }

      setPaidPayment(res.payment)
      setUncertain(false)

      // Invalidate queries
      void client.invalidateQueries({ queryKey: orderKeys.detail(scope, order.id) })
      void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
      void client.invalidateQueries({ queryKey: orderKeys.activeOrders(scope) })
      void client.invalidateQueries({ queryKey: ['cashier', scope, 'payments', order.id] })

      onSuccess?.(updated, res.payment)
    } catch (err) {
      const e = orderError(err)
      if (e.isNetworkError || !e.status || e.status >= 500) {
        setUncertain(true)
      } else {
        setIntent(null)
      }
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <Modal
      title={paidPayment ? 'Thanh toán thành công' : 'Thu tiền đơn hàng ' + order.orderCode}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <div className="pos-payment-modal-body">
        {paidPayment ? (
          <div className="pos-payment-success">
            <div className="pos-payment-success-badge">
              <span className="pos-payment-success-icon" aria-hidden="true">✓</span>
              <h3>Đã ghi nhận thanh toán</h3>
              <p className="order-muted">Mã thanh toán: <strong>{paidPayment.paymentCode}</strong></p>
            </div>

            <div className="pos-payment-receipt-summary">
              <div className="pos-receipt-row">
                <span>Mã đơn hàng:</span>
                <strong>{order.orderCode}</strong>
              </div>
              <div className="pos-receipt-row">
                <span>Số tiền thanh toán:</span>
                <strong className="pos-price-highlight">
                  {formatMinor(moneyMinor(paidPayment.amount), paidPayment.currencyCode)}
                </strong>
              </div>
              <div className="pos-receipt-row">
                <span>Phương thức:</span>
                <span>{paidPayment.paymentMethod === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}</span>
              </div>
              {paidPayment.referenceNo && (
                <div className="pos-receipt-row">
                  <span>Mã tham chiếu:</span>
                  <span>{paidPayment.referenceNo}</span>
                </div>
              )}
              {method === 'CASH' && isGivenEntered && (
                <>
                  <div className="pos-receipt-row">
                    <span>Khách đưa:</span>
                    <span>{formatMinor(givenMinor, currency)}</span>
                  </div>
                  <div className="pos-receipt-row pos-receipt-change">
                    <span>Tiền thừa trả khách:</span>
                    <strong>{formatMinor(changeMinor, currency)}</strong>
                  </div>
                </>
              )}
              <div className="pos-receipt-row">
                <span>Thời gian:</span>
                <span>{paidPayment.paidAt ? new Date(paidPayment.paidAt).toLocaleString('vi-VN') : ''}</span>
              </div>
            </div>

            {/* Hidden printable receipt for window.print() */}
            <div className="pos-printable-area">
              <ReceiptPrint order={latestOrder} payment={paidPayment} cashGiven={givenMinor} change={changeMinor} />
            </div>

            <div className="order-actions pos-payment-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={handlePrint}
              >
                🖨 In hóa đơn / Phiếu thu
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={onClose}
              >
                Hoàn tất
              </button>
            </div>
          </div>
        ) : (
          <>
            {!allowed ? (
              <div className="order-feedback" role="alert">
                Bạn không có quyền thu tiền (Cần PAYMENT_CREATE, PAYMENT_CONFIRM và feature PAYMENT_MANAGEMENT).
              </div>
            ) : (
              <>
                <OrderFeedback error={error} />
                {uncertain && (
                  <div className="order-warning" role="alert">
                    Kết quả thanh toán chưa rõ do sự cố mạng. Vui lòng bấm kiểm tra lại để gửi lại yêu cầu gốc, không tự tạo yêu cầu mới.
                  </div>
                )}

                {/* Order quick snapshot */}
                <div className="pos-payment-order-summary">
                  <div className="pos-payment-summary-header">
                    <div>
                      <span className="order-eyebrow">
                        {order.serviceType === 'TAKEAWAY' ? 'Mang đi' : 'Tại bàn'}
                      </span>
                      <h4>{order.orderCode}</h4>
                    </div>
                    <div className="pos-payment-amount-box">
                      <span className="order-muted">Tổng phải thu:</span>
                      <strong className="pos-payment-total">
                        {formatMinor(totalMinor, currency)}
                      </strong>
                    </div>
                  </div>

                  <div className="pos-payment-items-preview">
                    <span>{order.items.length} món:</span>
                    <p className="order-muted">
                      {order.items
                        .filter((i) => i.status !== 'CANCELLED')
                        .map((i) => `${i.quantity}x ${i.itemName}`)
                        .join(', ')}
                    </p>
                  </div>
                </div>

                {/* Payment method tabs */}
                <div className="pos-payment-methods">
                  <button
                    type="button"
                    className={`pos-method-tab ${method === 'CASH' ? 'active' : ''}`}
                    onClick={() => {
                      if (!busy) setMethod('CASH')
                    }}
                    disabled={busy || uncertain}
                  >
                    <span className="pos-method-icon">💵</span>
                    <div>
                      <strong>Tiền mặt</strong>
                      <small>Khách thanh toán trực tiếp</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`pos-method-tab ${method === 'TRANSFER' ? 'active' : ''}`}
                    onClick={() => {
                      if (!busy) setMethod('TRANSFER')
                    }}
                    disabled={busy || uncertain}
                  >
                    <span className="pos-method-icon">💳</span>
                    <div>
                      <strong>Chuyển khoản</strong>
                      <small>Nhân viên tự đối soát</small>
                    </div>
                  </button>
                </div>

                {/* Cash fields */}
                {method === 'CASH' && (
                  <div className="pos-payment-cash-section">
                    <label>
                      <span>Khách đưa:</span>
                      <div className="pos-input-group">
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={busy || uncertain}
                          placeholder={formatMinor(totalMinor, currency)}
                          value={cashGiven}
                          onChange={(e) => setCashGiven(e.target.value)}
                        />
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => setCashGiven(String(Number(totalMinor / 100n)))}
                          disabled={busy || uncertain}
                        >
                          Đủ tiền
                        </button>
                      </div>
                    </label>

                    {/* Quick amount chips */}
                    <div className="pos-quick-amounts">
                      {quickAmounts.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          className="pos-quick-amt-chip"
                          onClick={() => setCashGiven(String(amt))}
                          disabled={busy || uncertain}
                        >
                          {amt.toLocaleString('vi-VN')} đ
                        </button>
                      ))}
                    </div>

                    {isInsufficient && (
                      <p className="field-error" role="alert">
                        Tiền khách đưa chưa đủ (còn thiếu {formatMinor(totalMinor - givenMinor, currency)}).
                      </p>
                    )}

                    {isGivenEntered && !isInsufficient && (
                      <div className="pos-change-box">
                        <span>Tiền thừa trả khách:</span>
                        <strong className="pos-change-amount">
                          {formatMinor(changeMinor, currency)}
                        </strong>
                      </div>
                    )}
                  </div>
                )}

                {/* Transfer fields */}
                {method === 'TRANSFER' && (
                  <div className="pos-payment-transfer-section">
                    <label>
                      <span>Mã giao dịch / Mã tham chiếu <strong className="text-danger">*</strong></span>
                      <input
                        type="text"
                        maxLength={100}
                        disabled={busy || uncertain}
                        placeholder="VD: BANK-TXN-123456 hoặc STT chuyển khoản"
                        value={referenceNo}
                        onChange={(e) => setReferenceNo(e.target.value)}
                      />
                    </label>
                    <p className="order-muted">
                      ⚠️ Thu ngân tự kiểm tra biến động số dư tài khoản ngân hàng và xác nhận đã nhận đủ tiền trước khi nhấn xác nhận.
                    </p>
                  </div>
                )}

                <div className="order-actions pos-modal-footer">
                  <button
                    type="button"
                    className="button button-ghost"
                    disabled={busy}
                    onClick={onClose}
                  >
                    Hủy
                  </button>

                  {uncertain ? (
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy}
                      onClick={() => void handleRecordPayment(true)}
                    >
                      {busy ? 'Đang kiểm tra...' : 'Kiểm tra bằng yêu cầu thanh toán ban đầu'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button button-primary pos-confirm-pay-btn"
                      disabled={
                        busy ||
                        (method === 'CASH' && isInsufficient) ||
                        (method === 'TRANSFER' && !referenceNo.trim())
                      }
                      onClick={() => void handleRecordPayment(false)}
                    >
                      {busy ? 'Đang xử lý...' : `Xác nhận thu ${formatMinor(totalMinor, currency)}`}
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
