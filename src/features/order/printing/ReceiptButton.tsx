import type { Order } from '../types'
import { useOrderAccess } from '../hooks/useOrderAccess'
import { canOrder } from '../policies/orderAccessPolicy'
import { receiptKindForOrder, receiptErrorMessage } from './receiptModel'
import { useReceiptPrinting } from './ReceiptPrintingContext'

export function ReceiptButton({ order, disabled = false }: { order: Order; disabled?: boolean }) {
  const { access } = useOrderAccess()
  const printing = useReceiptPrinting()
  if (!canOrder(access, 'ORDER_VIEW')) return null
  let kind: ReturnType<typeof receiptKindForOrder>
  try {
    kind = receiptKindForOrder(order)
  } catch (error) {
    return <span className="order-muted">{receiptErrorMessage(error)}</span>
  }
  return (
    <button
      type="button"
      className="button button-ghost"
      disabled={disabled || !printing.available}
      onClick={() =>
        printing.openReceipt({
          orderId: order.id,
          reprint: kind === 'paid',
          expectedKind: kind,
          expectedVersion: order.version,
        })
      }
    >
      {kind === 'paid' ? 'In lại bill' : 'In tạm tính'}
    </button>
  )
}
