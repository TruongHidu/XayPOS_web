import { registerTenantErrors } from '../../../shared/errors/tenantErrorMessages'
import type { PermissionCatalogItem } from '../schemas'

/** Plain Vietnamese wording for owners (same as the app); unknown codes keep the server's name. */
const permissionNames: Record<string, string> = {
  DASHBOARD_VIEW: 'Xem trang tổng quan',
  MENU_VIEW: 'Xem thực đơn',
  MENU_CREATE: 'Thêm món và nhóm món',
  MENU_UPDATE: 'Sửa món và nhóm món',
  MENU_DELETE: 'Xóa món và nhóm món',
  MENU_AVAILABILITY_UPDATE: 'Báo còn / hết món',
  INGREDIENT_VIEW: 'Xem nguyên liệu',
  INGREDIENT_CREATE: 'Thêm nguyên liệu',
  INGREDIENT_UPDATE: 'Sửa nguyên liệu',
  INGREDIENT_DELETE: 'Xóa nguyên liệu',
  RECIPE_VIEW: 'Xem công thức',
  RECIPE_CREATE: 'Thêm công thức',
  RECIPE_UPDATE: 'Sửa công thức',
  RECIPE_DELETE: 'Xóa công thức',
  ORDER_VIEW: 'Xem đơn hàng',
  ORDER_CREATE: 'Tạo đơn và gọi món',
  ORDER_UPDATE: 'Sửa đơn hàng',
  ORDER_CANCEL: 'Hủy đơn hàng',
  ORDER_COMPLETE: 'Hoàn tất đơn hàng',
  ORDER_MARK_SERVED: 'Báo đã lên món',
  PAYMENT_VIEW: 'Xem thanh toán',
  PAYMENT_CREATE: 'Thu tiền',
  PAYMENT_CONFIRM: 'Xác nhận thanh toán',
  TABLE_VIEW: 'Xem bàn và khu vực',
  TABLE_CREATE: 'Thêm bàn và khu vực',
  TABLE_UPDATE: 'Sửa bàn, khu vực và mã QR',
  TABLE_OPEN: 'Mở bàn',
  TABLE_CLOSE: 'Đóng / hủy phiên bàn',
  TABLE_TRANSFER: 'Chuyển bàn',
  KITCHEN_VIEW: 'Xem màn hình bếp',
  KITCHEN_START_COOKING: 'Bắt đầu chế biến món',
  KITCHEN_MARK_READY: 'Báo món đã xong',
  QR_MENU_VIEW: 'Xem thực đơn QR',
  INVENTORY_VIEW: 'Xem tồn kho',
  INVENTORY_RECEIVE: 'Nhập kho',
  INVENTORY_ISSUE: 'Xuất kho',
  INVENTORY_ADJUST: 'Điều chỉnh tồn kho',
  INVENTORY_THRESHOLD_UPDATE: 'Đặt ngưỡng tồn thấp',
  INVENTORY_ALERT_ACKNOWLEDGE: 'Xác nhận cảnh báo tồn thấp',
  STOCK_AUDIT_MANAGE: 'Tạo và đếm phiếu kiểm kê',
  STOCK_AUDIT_CONFIRM: 'Chốt phiếu kiểm kê',
  WAREHOUSE_CREATE: 'Thêm kho',
  WAREHOUSE_UPDATE: 'Sửa kho',
  WAREHOUSE_DELETE: 'Xóa kho',
  CASHBOOK_VIEW: 'Xem sổ quỹ',
  CASHBOOK_CREATE: 'Ghi nhận phiếu chi',
  CASHBOOK_VOID: 'Hủy phiếu chi',
  REPORT_DAILY_VIEW: 'Xem báo cáo theo ngày',
  REPORT_DETAIL_VIEW: 'Xem báo cáo chi tiết',
  STAFF_VIEW: 'Xem nhân viên',
  STAFF_CREATE: 'Thêm nhân viên',
  STAFF_UPDATE: 'Sửa thông tin nhân viên',
  STAFF_DISABLE: 'Khóa và mở khóa nhân viên',
  STAFF_PERMISSION_MANAGE: 'Phân quyền nhân viên',
}

const groupOrder: Array<[string, string]> = [
  ['DASHBOARD', 'Tổng quan'],
  ['ORDER', 'Đơn hàng'],
  ['PAYMENT', 'Thanh toán'],
  ['TABLE', 'Bàn'],
  ['KITCHEN', 'Bếp'],
  ['QR', 'Gọi món QR'],
  ['MENU', 'Thực đơn'],
  ['INGREDIENT', 'Nguyên liệu'],
  ['RECIPE', 'Công thức'],
  ['INVENTORY', 'Kho'],
  ['STOCK', 'Kho'],
  ['WAREHOUSE', 'Kho'],
  ['CASHBOOK', 'Sổ quỹ'],
  ['REPORT', 'Báo cáo'],
  ['STAFF', 'Nhân viên'],
  ['RESTAURANT', 'Nhà hàng'],
]
const groupLabels = Object.fromEntries(groupOrder)

export const permissionName = (item: Pick<PermissionCatalogItem, 'code' | 'name'>) => permissionNames[item.code] ?? item.name

/** Groups the catalog by module (falling back to the code prefix), in the order owners think about the shop. */
export function groupPermissions(items: PermissionCatalogItem[]) {
  const groups = new Map<string, PermissionCatalogItem[]>()
  for (const item of items) {
    const label = groupLabels[item.module.toUpperCase()] ?? groupLabels[item.code.split('_')[0]] ?? item.module
    groups.set(label, [...(groups.get(label) ?? []), item])
  }
  const order = groupOrder.map(([, label]) => label)
  const rank = (label: string) => (order.includes(label) ? order.indexOf(label) : order.length)
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([label, list]) => ({ label, items: list }))
}

registerTenantErrors({
  INVALID_STAFF_RESPONSE: 'Dữ liệu nhân viên trả về không hợp lệ. Vui lòng tải lại.',
  USER_NOT_FOUND: 'Không tìm thấy nhân viên.',
  EMAIL_EXISTS: 'Email này đã được dùng cho một tài khoản khác.',
  STAFF_ROLE_NOT_ALLOWED: 'Bạn không được gán vai trò này.',
  ROLE_NOT_FOUND: 'Vai trò không còn khả dụng.',
  OWNER_ACCOUNT_PROTECTED: 'Không thể thay đổi tài khoản chủ quán.',
  STAFF_SELF_MANAGEMENT_NOT_ALLOWED: 'Bạn không thể tự thay đổi tài khoản của mình tại đây.',
  STAFF_TARGET_FORBIDDEN: 'Bạn không có quyền quản lý nhân viên này.',
  STAFF_LIMIT_REACHED: 'Đã đạt số nhân viên tối đa của gói dịch vụ. Khóa bớt nhân viên hoặc nâng cấp gói.',
  INVALID_STAFF_LIMIT_CONFIG: 'Cấu hình giới hạn nhân viên của gói chưa hợp lệ. Liên hệ hỗ trợ.',
  CONCURRENT_STAFF_UPDATE: 'Nhân viên vừa được cập nhật ở nơi khác. Tải lại để xem dữ liệu mới.',
  PERMISSION_EFFECT_CONFLICT: 'Một quyền không thể vừa cho phép vừa chặn.',
  PERMISSION_NOT_FOUND: 'Có quyền không còn tồn tại. Tải lại danh sách quyền.',
  PERMISSION_NOT_ASSIGNABLE: 'Có quyền hệ thống không được phép cấp.',
  PERMISSION_ESCALATION_NOT_ALLOWED: 'Bạn chỉ có thể cấp những quyền mà chính bạn đang có.',
})
