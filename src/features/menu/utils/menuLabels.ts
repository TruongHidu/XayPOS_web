import { registerTenantErrors } from '../../../shared/errors/tenantErrorMessages'
import type { Tone } from '../../../shared/ui/Display'
import type { InventoryMode, MenuItem } from '../adminSchemas'

export const inventoryModeLabels: Record<InventoryMode, { label: string; hint: string }> = {
  NONE: { label: 'Không theo dõi kho', hint: 'Bán không trừ tồn kho.' },
  DIRECT: { label: 'Trừ kho trực tiếp', hint: 'Hàng bán sẵn (lon nước, chai…): mỗi phần bán trừ 1 đơn vị tồn của chính món.' },
  RECIPE: { label: 'Trừ kho theo công thức', hint: 'Mỗi phần bán trừ nguyên liệu theo công thức đang áp dụng.' },
}

/** Customer-facing sale state of an item. */
export function itemSaleState(item: Pick<MenuItem, 'active' | 'availabilityStatus' | 'sellable' | 'group'>): { label: string; tone: Tone } {
  if (!item.active) return { label: 'Ngừng bán', tone: 'neutral' }
  if (item.availabilityStatus === 'OUT_OF_STOCK') return { label: 'Hết món', tone: 'warning' }
  if (item.group && !item.group.active) return { label: 'Nhóm đang tắt', tone: 'neutral' }
  return item.sellable ? { label: 'Đang bán', tone: 'success' } : { label: 'Không bán được', tone: 'neutral' }
}

registerTenantErrors({
  INVALID_MENU_RESPONSE: 'Dữ liệu thực đơn trả về không hợp lệ. Vui lòng tải lại.',
  EMPTY_UPDATE_REQUEST: 'Chưa có thay đổi nào để lưu.',
  MENU_GROUP_NOT_FOUND: 'Không tìm thấy nhóm món.',
  MENU_ITEM_NOT_FOUND: 'Không tìm thấy món.',
  MENU_GROUP_NAME_EXISTS: 'Tên nhóm đã tồn tại.',
  SKU_EXISTS: 'Mã SKU đã được dùng cho món hoặc nguyên liệu khác.',
  MENU_GROUP_INACTIVE: 'Nhóm món đang tắt, hãy chọn nhóm khác hoặc bật lại nhóm.',
  MENU_GROUP_NOT_EMPTY: 'Nhóm vẫn còn món. Chuyển hoặc xóa các món trong nhóm trước.',
  INVALID_MENU_ITEM_TRANSITION: 'Món đang ngừng bán nên không đổi được trạng thái còn/hết.',
  CONCURRENT_MENU_UPDATE: 'Món hoặc nhóm vừa được sửa ở nơi khác. Tải lại để xem dữ liệu mới.',
  MENU_ITEM_UNIT_IN_USE: 'Món đang có công thức áp dụng nên không đổi được đơn vị bán.',
  MENU_ITEM_HAS_ACTIVE_RECIPE: 'Món đang có công thức. Ngừng công thức trước khi xóa món.',
  INVALID_IMAGE: 'Ảnh không hợp lệ. Chỉ nhận JPG, PNG hoặc WebP.',
  IMAGE_TOO_LARGE: 'Ảnh vượt quá 5 MB.',
  IMAGE_UPLOAD_FAILED: 'Tải ảnh lên thất bại. Vui lòng thử lại.',
  IMAGE_STORAGE_NOT_CONFIGURED: 'Máy chủ chưa cấu hình lưu ảnh. Liên hệ quản trị.',
  COST_PRICE_REQUIRED: 'Nhập giá vốn tham chiếu.',
  INVALID_COST_CONFIGURATION: 'Cấu hình giá vốn chưa hợp lệ.',
  INVENTORY_TRACKING_MODE_CONFLICT: 'Món không thể vừa trừ kho trực tiếp vừa theo công thức.',
  STOCK_TRACKING_CHANGE_NOT_ALLOWED: 'Món đang có tồn kho, hàng đang giữ hoặc phiếu kho nháp nên chưa đổi được cách trừ kho.',
  STOCK_ITEM_UNIT_CHANGE_NOT_ALLOWED: 'Món đang có tồn kho nên chưa đổi được đơn vị.',
  STOCK_ITEM_DELETE_NOT_ALLOWED: 'Món đang có tồn kho hoặc phiếu kho nên chưa xóa được.',
  ACTIVE_RECIPE_REQUIRED: 'Món chưa có công thức hợp lệ. Tạo công thức trước khi áp dụng trừ kho theo công thức.',
  RECIPE_APPLICATION_ENABLED: 'Món đang áp dụng công thức. Tắt áp dụng trước khi ngừng công thức.',
  INGREDIENT_NOT_FOUND: 'Không tìm thấy nguyên liệu.',
  INGREDIENT_UNIT_IN_USE: 'Nguyên liệu đang dùng trong công thức nên không đổi được đơn vị.',
  INGREDIENT_HAS_RESERVATIONS: 'Nguyên liệu đang được giữ cho đơn chưa phục vụ, thử lại sau.',
  INGREDIENT_USED_BY_ACTIVE_RECIPE: 'Nguyên liệu đang dùng trong công thức của món.',
  INGREDIENT_INACTIVE: 'Có nguyên liệu đang tắt trong công thức.',
  CONCURRENT_INGREDIENT_UPDATE: 'Nguyên liệu vừa được sửa ở nơi khác. Tải lại để xem dữ liệu mới.',
  RECIPE_NOT_FOUND: 'Không tìm thấy công thức.',
  ACTIVE_RECIPE_NOT_FOUND: 'Món chưa có công thức đang dùng.',
  ACTIVE_RECIPE_ALREADY_EXISTS: 'Món đã có công thức. Tải lại và tạo phiên bản mới.',
  RECIPE_NOT_ACTIVE: 'Phiên bản này không còn là công thức đang dùng. Tải lại.',
  DUPLICATE_RECIPE_INGREDIENT: 'Mỗi nguyên liệu chỉ được thêm một lần.',
  SAME_RECIPE_VERSION_NOT_ALLOWED: 'Công thức mới giống hệt phiên bản hiện tại.',
  CONCURRENT_RECIPE_UPDATE: 'Công thức vừa được sửa ở nơi khác. Tải lại để xem phiên bản mới.',
  INGREDIENT_COST_NOT_CONFIGURED: 'Có nguyên liệu chưa xác định giá vốn nên chưa ước tính được.',
  INGREDIENT_COST_UNIT_MISMATCH: 'Đơn vị nguyên liệu đã đổi so với công thức nên không ước tính được.',
  INGREDIENT_COST_UNAVAILABLE: 'Thiếu giá vốn nguyên liệu nên chưa ước tính được.',
  INVALID_INGREDIENT_REFERENCE_COST: 'Giá vốn nguyên liệu không hợp lệ.',
  INVALID_RECIPE_COST_DATA: 'Dữ liệu công thức không hợp lệ để ước tính.',
  RECIPE_INGREDIENT_UNIT_MISMATCH: 'Đơn vị nguyên liệu không khớp công thức.',
  RECIPE_YIELD_UNIT_MISMATCH: 'Đơn vị thành phẩm không khớp đơn vị bán của món.',
})
