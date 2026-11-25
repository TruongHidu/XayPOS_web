import { qrRequestInputSchema } from '../schemas'
import type { PublicEntry, QrReceipt, QrRequestInput } from '../types'
import { QrOrderError } from '../utils/qrOrderErrors'
import { z } from 'zod'
export function validateQrBody(entry: PublicEntry, input: QrRequestInput) {
  const body = qrRequestInputSchema.parse(input)
  if (entry.entryType === 'RESTAURANT')
    z.string()
      .trim()
      .min(1, 'Vui lòng nhập tên nhận hàng.')
      .parse(body.customerName ?? '')
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 32768)
    throw new QrOrderError('QR_REQUEST_BODY_TOO_LARGE')
  return body
}
/** Lines staff left out of an approved request have no order line behind them. */
export const isExcludedLine = (line: QrReceipt['items'][number]) => line.approvedOrderItemId === null
export function receiptLabel(receipt: QrReceipt) {
  if (receipt.status === 'APPROVED')
    return receipt.items.some(isExcludedLine) ? 'Nhà hàng đã nhận một phần yêu cầu' : 'Nhà hàng đã nhận yêu cầu'
  if (receipt.status === 'REJECTED') return 'Nhà hàng chưa thể nhận yêu cầu'
  if (receipt.status === 'CANCELLED') return 'Yêu cầu không còn hiệu lực'
  return receipt.expired ? 'Yêu cầu chờ duyệt đã hết hạn' : 'Đang chờ nhà hàng xác nhận'
}
export function receiptNeedsPolling(receipt?: QrReceipt) {
  if (!receipt) return true
  return receipt.status === 'PENDING'
    ? !receipt.expired
    : receipt.status === 'APPROVED' &&
        receipt.items.some((item) => !isExcludedLine(item) && !['SERVED', 'CANCELLED'].includes(item.status ?? ''))
}
export const entryPath = (entry: PublicEntry) =>
  (entry.entryType === 'TABLE' ? '/qr/' : '/menu/') + encodeURIComponent(entry.token)
