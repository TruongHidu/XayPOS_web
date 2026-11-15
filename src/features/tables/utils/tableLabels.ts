import { registerTenantErrors } from '../../../shared/errors/tenantErrorMessages'
import type { Tone } from '../../../shared/ui/Display'
import type { RestaurantTable } from '../schemas'

export type TableState = 'serving' | 'empty' | 'inactive'

export function tableState(table: Pick<RestaurantTable, 'status' | 'occupied'>): TableState {
  if (table.occupied) return 'serving'
  return table.status === 'INACTIVE' ? 'inactive' : 'empty'
}

export const tableStateLabels: Record<TableState, { label: string; tone: Tone }> = {
  serving: { label: 'Đang phục vụ', tone: 'warning' },
  empty: { label: 'Trống', tone: 'success' },
  inactive: { label: 'Ngưng dùng', tone: 'neutral' },
}

/** "1 giờ 05 phút" since the session opened. */
export function elapsedSince(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000))
  if (minutes < 60) return `${minutes} phút`
  const hours = Math.floor(minutes / 60)
  return `${hours} giờ ${String(minutes % 60).padStart(2, '0')} phút`
}

registerTenantErrors({
  INVALID_TABLE_RESPONSE: 'Dữ liệu bàn trả về không hợp lệ. Vui lòng tải lại.',
  TABLE_AREA_NOT_FOUND: 'Không tìm thấy khu vực.',
  TABLE_NOT_FOUND: 'Không tìm thấy bàn.',
  TABLE_SESSION_NOT_FOUND: 'Không tìm thấy phiên phục vụ.',
  TABLE_AREA_NAME_EXISTS: 'Tên khu vực đã tồn tại.',
  TABLE_CODE_EXISTS: 'Mã bàn đã được dùng (kể cả bàn đã xóa).',
  TABLE_AREA_INACTIVE: 'Khu vực đang tắt. Bật khu vực hoặc chọn khu khác.',
  TABLE_AREA_NOT_EMPTY: 'Khu vực vẫn còn bàn. Chuyển hoặc xóa các bàn trước.',
  TABLE_AREA_HAS_OPEN_SESSIONS: 'Khu vực đang có bàn phục vụ khách nên chưa tắt được.',
  TABLE_INACTIVE: 'Bàn đang ngưng dùng.',
  TABLE_ALREADY_OCCUPIED: 'Bàn đã có khách. Tải lại để xem phiên đang phục vụ.',
  TABLE_HAS_OPEN_SESSION: 'Bàn đang phục vụ khách nên chưa đổi mã, số chỗ, khu vực, ngưng dùng hay xóa được.',
  INVALID_TABLE_SESSION_TRANSITION: 'Phiên phục vụ không còn mở. Tải lại để xem trạng thái mới.',
  CONCURRENT_TABLE_UPDATE: 'Bàn hoặc phiên vừa được cập nhật ở nơi khác. Tải lại để xem dữ liệu mới.',
  QR_TOKEN_CONFLICT: 'Không tạo được mã QR mới, vui lòng thử lại.',
  SAME_TABLE_TRANSFER_NOT_ALLOWED: 'Phiên đã ở bàn này rồi.',
  TABLE_TRANSFER_TARGET_UNAVAILABLE: 'Bàn đích không còn trống. Chọn bàn khác.',
  TABLE_SESSION_HAS_ORDERS: 'Phiên đã có đơn hàng nên không hủy được. Hoàn tất hoặc hủy đơn trước.',
})
