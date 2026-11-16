import { registerTenantErrors } from '../../../shared/errors/tenantErrorMessages'
import type { Tone } from '../../../shared/ui/Display'

/** "1.250,5 g" — never converts units (kg/g, thùng/lon). */
export const qty = (value: number | null | undefined, unit?: string) =>
  value === null || value === undefined ? '—' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ''}`

export const signedQty = (value: number, unit: string) => `${value > 0 ? '+' : ''}${qty(value, unit)}`

export const documentTypeLabels: Record<string, string> = { RECEIPT: 'Nhập kho', ISSUE: 'Xuất kho', ADJUSTMENT: 'Điều chỉnh' }
export const documentStatusLabels: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Nháp', tone: 'warning' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
}
export const transactionTypeLabels: Record<string, string> = {
  RECEIPT: 'Nhập kho',
  ISSUE: 'Xuất kho',
  ADJUSTMENT_INCREASE: 'Điều chỉnh tăng',
  ADJUSTMENT_DECREASE: 'Điều chỉnh giảm',
  RECIPE_USE: 'Bán theo công thức',
  DIRECT_USE: 'Bán trực tiếp',
}
export const alertStatusLabels: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: 'Chưa xem', tone: 'danger' },
  ACKNOWLEDGED: { label: 'Đã xem', tone: 'warning' },
  RESOLVED: { label: 'Đã kết thúc', tone: 'neutral' },
}
export const resolutionLabels: Record<string, string> = {
  STOCK_RECOVERED: 'Tồn đã vượt ngưỡng',
  THRESHOLD_DISABLED: 'Đã tắt ngưỡng cảnh báo',
  WAREHOUSE_INACTIVE: 'Kho ngừng hoạt động',
  WAREHOUSE_DELETED: 'Kho đã bị xóa',
  INGREDIENT_UNTRACKED: 'Hàng không còn theo dõi tồn',
  INGREDIENT_DELETED: 'Hàng đã bị xóa',
  INGREDIENT_UNIT_CHANGED: 'Đơn vị hàng đã đổi',
}
export const auditStatusLabels: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  COUNTING: { label: 'Đang đếm', tone: 'warning' },
  CONFIRMED: { label: 'Đã chốt', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
}

registerTenantErrors({
  INVALID_INVENTORY_RESPONSE: 'Dữ liệu kho trả về không hợp lệ. Vui lòng tải lại.',
  WAREHOUSE_NOT_FOUND: 'Không tìm thấy kho.',
  WAREHOUSE_CODE_EXISTS: 'Mã kho đã được dùng (kể cả kho đã xóa).',
  WAREHOUSE_INACTIVE: 'Kho đang ngừng hoạt động.',
  WAREHOUSE_HAS_STOCK: 'Kho còn tồn hàng nên chưa tắt/xóa được.',
  WAREHOUSE_HAS_RESERVATIONS: 'Kho đang giữ hàng cho đơn chưa phục vụ nên chưa tắt/xóa được.',
  DEFAULT_WAREHOUSE_REQUIRED: 'Không thể tắt hoặc xóa kho mặc định. Đặt kho khác làm mặc định trước.',
  CANNOT_DISABLE_DEFAULT_WAREHOUSE: 'Không thể tắt kho mặc định. Đặt kho khác làm mặc định trước.',
  CONCURRENT_WAREHOUSE_UPDATE: 'Kho vừa được sửa ở nơi khác. Tải lại để xem dữ liệu mới.',
  CONCURRENT_INVENTORY_UPDATE: 'Tồn kho vừa thay đổi. Tải lại để xem số mới.',
  STOCK_DOCUMENT_NOT_FOUND: 'Không tìm thấy chứng từ.',
  STOCK_DOCUMENT_ITEM_NOT_FOUND: 'Dòng hàng không còn trong chứng từ.',
  INVALID_STOCK_DOCUMENT_TRANSITION: 'Chứng từ không còn ở trạng thái nháp.',
  STOCK_DOCUMENT_EMPTY: 'Chứng từ chưa có dòng hàng nào.',
  DUPLICATE_STOCK_DOCUMENT_ITEM: 'Mỗi hàng hóa chỉ được thêm một dòng trong chứng từ.',
  INVALID_ADJUSTMENT_DIRECTION: 'Chọn hướng điều chỉnh tăng hoặc giảm.',
  INGREDIENT_INACTIVE_FOR_RECEIPT: 'Có hàng đang ngừng dùng nên không nhập được.',
  INGREDIENT_UNIT_CHANGED: 'Đơn vị của một hàng đã đổi sau khi lập phiếu. Xóa dòng và thêm lại.',
  INSUFFICIENT_STOCK: 'Tồn kho không đủ để xuất.',
  INSUFFICIENT_AVAILABLE_STOCK: 'Không đủ tồn khả dụng: một phần đang được giữ cho đơn chưa phục vụ.',
  CONCURRENT_STOCK_DOCUMENT_UPDATE: 'Chứng từ vừa được sửa ở nơi khác. Tải lại để xem bản mới.',
  INVALID_INVENTORY_COST_DATA: 'Dữ liệu giá vốn không hợp lệ.',
  INVALID_STOCK_ITEM_REFERENCE: 'Hàng hóa không hợp lệ hoặc không theo dõi tồn.',
  STOCK_DOCUMENT_MANAGED_BY_AUDIT: 'Chứng từ do kiểm kê tạo nên chỉ xem, không sửa được.',
  INGREDIENT_HAS_STOCK: 'Hàng còn tồn kho.',
  LOW_STOCK_ALERT_NOT_FOUND: 'Không tìm thấy cảnh báo.',
  INVALID_LOW_STOCK_ALERT_TRANSITION: 'Cảnh báo đã kết thúc nên không cần xác nhận.',
  CONCURRENT_LOW_STOCK_ALERT_UPDATE: 'Cảnh báo vừa thay đổi. Tải lại trước khi xác nhận.',
  STOCK_AUDIT_NOT_FOUND: 'Không tìm thấy phiên kiểm kê.',
  STOCK_AUDIT_ITEM_NOT_FOUND: 'Có dòng không thuộc phiên kiểm kê này. Tải lại phiếu đếm.',
  INVALID_STOCK_AUDIT_TRANSITION: 'Phiên kiểm kê không còn ở bước này. Tải lại để xem trạng thái.',
  CONCURRENT_STOCK_AUDIT_UPDATE: 'Phiếu đếm vừa được lưu ở nơi khác. Tải lại và đối chiếu trước khi lưu tiếp.',
  WAREHOUSE_STOCK_AUDIT_IN_PROGRESS: 'Kho này đang có một phiên kiểm kê đang đếm.',
  STOCK_AUDIT_EMPTY: 'Kho không có hàng nào theo dõi tồn để kiểm kê.',
  STOCK_AUDIT_INCOMPLETE: 'Còn dòng chưa đếm. Đếm hết trước khi chốt.',
  STOCK_AUDIT_SNAPSHOT_STALE:
    'Kho đã có nhập/xuất/chế biến sau khi bắt đầu đếm nên số liệu không còn khớp. Hủy phiên này và tạo phiên mới để đếm lại.',
  INVENTORY_RESERVATION_INVARIANT_VIOLATION: 'Dữ liệu giữ hàng không nhất quán. Liên hệ hỗ trợ.',
  STOCK_AUDIT_ADJUSTMENT_OUT_OF_RANGE: 'Chênh lệch vượt giới hạn cho phép.',
  RESERVED_IDEMPOTENCY_NAMESPACE: 'Khóa thao tác không hợp lệ.',
})
