import { registerTenantErrors } from '../../../shared/errors/tenantErrorMessages'
import type { StockReceipt } from '../schemas'

export const entryTypeLabels: Record<string, string> = { INCOME: 'Thu', EXPENSE: 'Chi' }
export const sourceTypeLabels: Record<string, string> = { ORDER_PAYMENT: 'Thanh toán đơn', EXPENSE_VOUCHER: 'Phiếu chi' }
export const expenseStatusLabels: Record<string, string> = { POSTED: 'Hiệu lực', VOIDED: 'Đã hủy' }
export const methodLabels: Record<string, string> = { CASH: 'Tiền mặt', TRANSFER: 'Chuyển khoản' }

/** Fallback names when the category list has not loaded (codes from cashbook-api.md). */
export const categoryFallbackLabels: Record<string, string> = {
  SALES_COLLECTION: 'Thu bán hàng',
  INGREDIENT_PURCHASE: 'Mua nguyên liệu',
  RENT: 'Thuê mặt bằng',
  SALARY: 'Lương nhân viên',
  UTILITIES: 'Điện, nước, internet',
  MAINTENANCE: 'Sửa chữa, bảo trì',
  OTHER: 'Chi khác',
}

export const INGREDIENT_PURCHASE = 'INGREDIENT_PURCHASE'

/** Amount in the cashbook currency; `null` currency (UNKNOWN receipt) shows the bare number. */
export function cashMoney(value: number | null | undefined, currency: string | null | undefined) {
  if (value === null || value === undefined) return '—'
  if (!currency) return value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
  try {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: currency === 'VND' ? 0 : 2 }).format(value)
  } catch {
    return `${value.toLocaleString('vi-VN')} ${currency}`
  }
}

/** Receipt value; UNKNOWN currency shows the bare number (no symbol). */
export const receiptCost = (row: StockReceipt) => cashMoney(row.totalCost, row.currencyStatus === 'KNOWN' ? row.currencyCode : null)

registerTenantErrors({
  INVALID_CASHBOOK_RESPONSE: 'Dữ liệu sổ thu chi trả về không hợp lệ. Vui lòng tải lại.',
  INVALID_CASHBOOK_DATE_RANGE: 'Khoảng ngày không hợp lệ: ngày bắt đầu phải trước ngày kết thúc.',
  CASHBOOK_RANGE_TOO_LARGE: 'Khoảng ngày tối đa 366 ngày.',
  INVALID_CASHBOOK_CURRENCY: 'Mã tiền tệ không hợp lệ.',
  INVALID_CASHBOOK_SORT: 'Cách sắp xếp không hợp lệ.',
  INVALID_CASHBOOK_FILTER: 'Bộ lọc không hợp lệ. Hãy kiểm tra lại danh mục, phương thức hoặc từ khóa.',
  INVALID_EXPENSE_AMOUNT: 'Số tiền chi phải lớn hơn 0 và tối đa 2 chữ số thập phân.',
  EXPENSE_DATE_IN_FUTURE: 'Ngày chi không được ở tương lai.',
  CASHBOOK_EXPENSE_NOT_FOUND: 'Không tìm thấy phiếu chi.',
  CASHBOOK_CATEGORY_NOT_FOUND: 'Danh mục chi không tồn tại hoặc đã ngừng dùng.',
  CASHBOOK_IDEMPOTENCY_KEY_REUSED: 'Yêu cầu ghi chi này đã dùng cho nội dung khác. Hãy mở lại form và ghi nhận lại.',
  CONCURRENT_CASHBOOK_UPDATE: 'Phiếu chi vừa được người khác thay đổi. Hãy tải lại rồi thử lại.',
  INVALID_STOCK_RECEIPT_LINK: 'Chỉ liên kết được phiếu nhập kho đã xác nhận, với danh mục "Mua nguyên liệu".',
  STOCK_RECEIPT_CURRENCY_MISMATCH: 'Tiền tệ của phiếu nhập khác tiền tệ của khoản chi.',
})
