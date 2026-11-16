import { registerTenantErrors } from '../../../shared/errors/tenantErrorMessages'
import { formatIsoDate } from '../../../shared/ui/dateRange'

/** Money in the report's own currency (never converted or mixed). */
export function money(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined) return '—'
  try {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: currency === 'VND' ? 0 : 2 }).format(value)
  } catch {
    return `${value.toLocaleString('vi-VN')} ${currency}`
  }
}

export const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`
export const num = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 3 })

/** Chart labels: "15/11" for days, "T11/26" for months. */
export function bucketLabel(isoDate: string, granularity: 'DAY' | 'MONTH') {
  const [year, month, day] = isoDate.split('-')
  return granularity === 'MONTH' ? `T${Number(month)}/${year.slice(2)}` : `${day}/${month}`
}

export const rangeLabel = (from: string, to: string) => (from === to ? formatIsoDate(from) : `${formatIsoDate(from)} – ${formatIsoDate(to)}`)

export const serviceTypeLabels: Record<string, string> = { DINE_IN: 'Tại bàn', TAKEAWAY: 'Mang đi' }
export const sourceChannelLabels: Record<string, string> = {
  CASHIER: 'Thu ngân',
  WAITER: 'Phục vụ',
  QR_STATIC: 'QR mang đi',
  QR_TABLE: 'QR tại bàn',
}
export const paymentMethodLabels: Record<string, string> = { CASH: 'Tiền mặt', TRANSFER: 'Chuyển khoản' }
export const dateBasisLabels: Record<string, string> = {
  CREATED: 'Ngày tạo đơn',
  COMPLETED: 'Ngày hoàn tất',
  CANCELLED: 'Ngày hủy đơn',
  PAID: 'Ngày thu tiền',
}
export const coverageLabels: Record<string, string> = {
  COMPLETE: 'Đủ giá vốn',
  PARTIAL: 'Thiếu một phần',
  UNAVAILABLE: 'Không có giá vốn',
  NO_DATA: 'Chưa có đơn',
}
export const costIssueLabels: Record<string, string> = {
  INCOMPLETE: 'Có món chưa cấu hình giá vốn lúc bán',
  UNAVAILABLE: 'Không có giá vốn',
  LEGACY_UNAVAILABLE: 'Đơn cũ trước khi lưu giá vốn',
  NO_ELIGIBLE_ITEMS: 'Không có món để tính',
}

registerTenantErrors({
  INVALID_REPORT_RESPONSE: 'Dữ liệu báo cáo trả về không hợp lệ. Vui lòng tải lại.',
  INVALID_REPORT_DATE_RANGE: 'Khoảng ngày không hợp lệ: ngày bắt đầu phải trước ngày kết thúc.',
  REPORT_RANGE_TOO_LARGE: 'Khoảng ngày tối đa 366 ngày.',
  INVALID_REPORT_CURRENCY: 'Mã tiền tệ không hợp lệ.',
  INVALID_REPORT_SORT: 'Cách sắp xếp không hợp lệ.',
  INVALID_REPORT_TIMEZONE: 'Múi giờ của nhà hàng đang cấu hình sai. Liên hệ hỗ trợ.',
  REPORT_COST_DATA_CONFLICT: 'Dữ liệu giá vốn của một số đơn không nhất quán. Thử lại sau hoặc liên hệ hỗ trợ.',
})
