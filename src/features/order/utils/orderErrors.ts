import { ZodError } from 'zod'
import axios from 'axios'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import type { NormalizedApiError } from '../../../shared/types/auth'
const messages: Record<string, string> = {
  INVALID_QR_REVIEW_RESPONSE:
    'Dữ liệu xác nhận QR chưa hợp lệ. Đọc lại yêu cầu để kiểm tra kết quả trước khi thao tác tiếp.',
  QR_REVIEW_REQUIRED: 'Cần đọc lại yêu cầu và kiểm tra quyền xác nhận trước khi tiếp tục.',
  QR_REVIEW_CONTEXT_CHANGED: 'Giá món hoặc phiên bàn đã thay đổi. Đọc lại yêu cầu và kiểm tra trước khi xác nhận.',
  CONCURRENT_QR_REQUEST_UPDATE: 'Yêu cầu vừa được nhân viên khác xử lý. Đọc lại để kiểm tra trạng thái mới.',
  QR_ORDER_REQUEST_EXPIRED: 'Yêu cầu gọi món đã hết hạn. Vui lòng đề nghị khách gửi yêu cầu mới.',
  QR_ORDER_REQUEST_NOT_FOUND: 'Không tìm thấy yêu cầu QR trong nhà hàng này.',
  INVALID_QR_REQUEST_TRANSITION: 'Yêu cầu không còn chờ xác nhận. Đọc lại để kiểm tra kết quả.',
  QR_REQUEST_SESSION_CHANGED: 'Phiên bàn của khách đã thay đổi. Kiểm tra với khách và đề nghị gửi lại yêu cầu.',
  QR_ORDER_DRAFT_NOT_SUBMITTED: 'Bàn đang có đơn nháp. Gửi đơn nháp trước khi nhận thêm món QR.',
  QR_ORDER_CHECKOUT_IN_PROGRESS: 'Bàn đang thanh toán, hiện không thể nhận thêm món QR.',
  QR_ORDER_UNAVAILABLE: 'Nhà hàng hoặc QR hiện chưa đủ điều kiện nhận yêu cầu gọi món.',
  INVALID_GUEST_COUNT: 'Số khách phải là số nguyên từ 1 đến 32767.',
  TABLE_OPEN_REQUIRED: 'Cần nhân viên có TABLE_OPEN để gửi đơn cho bàn trống.',
  DINE_IN_ORDER_VIEW_REQUIRED: 'Cần ORDER_VIEW để kiểm tra đơn đang phục vụ của bàn.',
  INVALID_DECIMAL: 'Tiền hoặc số lượng không đúng độ chính xác cho phép.',
  INVALID_QUANTITY: 'Số lượng phải >0 và có tối đa 3 chữ số thập phân.',
  ORDER_ACCESS_CHANGED: 'Phiên làm việc hoặc quyền gọi món đã thay đổi.',
  INVALID_ORDER_RESPONSE: 'Dữ liệu đơn trả về không hợp lệ. Hãy xác minh kết quả trước khi gửi lại.',
  INVALID_TENANT_RESPONSE: 'Dữ liệu danh mục trả về không hợp lệ.',
  INVALID_IDEMPOTENCY_KEY: 'Key thao tác không hợp lệ.',
  INVALID_PAYMENT_RESPONSE: 'Dữ liệu thanh toán không hợp lệ. Kiểm tra bằng yêu cầu ban đầu.',
  INVALID_KITCHEN_RESPONSE: 'Dữ liệu hàng đợi bếp không hợp lệ.',
  CONCURRENT_ORDER_UPDATE: 'Đơn đã được cập nhật. Giữ bản đang nhập và tải lại để đối chiếu.',
  IDEMPOTENCY_KEY_REUSED: 'Key tạo đơn đã có xung đột. Không tự tạo key khác, hãy kiểm tra đơn trước.',
  PAYMENT_IDEMPOTENCY_KEY_REUSED: 'Key thanh toán bị xung đột. Giữ yêu cầu ban đầu và kiểm tra giao dịch.',
  TABLE_SESSION_HAS_SERVING_ORDER: 'Bàn đã có đơn đang phục vụ. Giỏ được giữ; kiểm tra đơn trước khi gọi thêm.',
  INCONSISTENT_SERVING_ORDER_STATE: 'Phiên bàn có dữ liệu đơn không nhất quán. Liên hệ quản lý.',
  ORDER_NOT_PAYABLE: 'Đơn hiện không được phép thanh toán.',
  ORDER_ALREADY_PAID: 'Đơn đã được thanh toán. Tải lại để kiểm tra.',
  PAYMENT_AMOUNT_MISMATCH: 'Tổng tiền đã thay đổi. Tải lại đơn trước khi thanh toán.',
  TRANSFER_REFERENCE_REQUIRED: 'Chuyển khoản cần mã giao dịch đã đối soát.',
  CONCURRENT_PAYMENT_UPDATE: 'Đơn hoặc giao dịch đã thay đổi. Tải lại để đối chiếu.',
  ORDER_NOT_READY_FOR_COMPLETION: 'Chỉ hoàn tất sau khi đã giao tất cả món và thanh toán đủ.',
  ORDER_NOT_PAID: 'Đơn chưa được thanh toán đủ.',
  TABLE_SESSION_NOT_READY_TO_CLOSE: 'Phiên còn đơn chưa hoàn tất hoặc nghĩa vụ thanh toán.',
  INVALID_ORDER_ITEM_TRANSITION: 'Trạng thái món không cho phép thao tác này.',
  ORDER_CODE_CONFLICT: 'Mã đơn xung đột; yêu cầu chưa được lưu.',
  ORDER_NOT_FOUND: 'Đơn không tồn tại hoặc bạn không có quyền truy cập.',
  ORDER_ITEM_NOT_FOUND: 'Dòng món không tồn tại hoặc không còn quyền truy cập.',
  ORDER_NOT_EDITABLE: 'Đơn không còn được phép sửa.',
  ORDER_ITEM_NOT_EDITABLE: 'Dòng món không còn được phép sửa.',
  INVALID_ORDER_TRANSITION: 'Trạng thái đơn không cho phép thao tác này.',
  EMPTY_ORDER: 'Cần ít nhất một món còn hiệu lực.',
  TABLE_SESSION_NOT_OPEN: 'Phiên bàn không còn mở. Hãy chọn lại bàn.',
  INVALID_ORDER_SEATING: 'Đơn tại bàn thiếu liên kết phiên bàn hợp lệ.',
  TABLE_SESSION_NOT_FOUND: 'Không tìm thấy phiên bàn hoặc phiên không thuộc nhà hàng.',
  TABLE_SESSION_IN_USE: 'Phiên có đơn hoặc nghĩa vụ thanh toán, không thể hủy.',
  TABLE_ALREADY_OCCUPIED: 'Bàn đã có phiên mới. Kiểm tra lại và xác nhận phiên cần dùng.',
  CONCURRENT_TABLE_UPDATE: 'Bàn đã thay đổi. Hãy đọc lại trước khi mở.',
  TABLE_INACTIVE: 'Bàn đang ngừng hoạt động.',
  TABLE_AREA_INACTIVE: 'Khu vực ngừng hoạt động.',
  ITEM_NOT_SELLABLE: 'Món vừa ngừng bán. Giỏ được giữ để bạn sửa.',
  ITEM_OUT_OF_STOCK: 'Món vừa hết hàng. Giỏ được giữ để bạn sửa.',
  ACTIVE_RECIPE_REQUIRED:
    'Món đang bật sử dụng công thức nhưng chưa có công thức hoạt động hợp lệ. Nội dung được giữ; nhờ quản lý kiểm tra công thức trước khi gửi lại.',
  RECIPE_INGREDIENT_UNAVAILABLE:
    'Nguyên liệu trong công thức không còn khả dụng. Nội dung được giữ; nhờ quản lý kiểm tra nguyên liệu.',
  RECIPE_INGREDIENT_UNIT_MISMATCH:
    'Đơn vị nguyên liệu không khớp với công thức. Nội dung được giữ; nhờ quản lý kiểm tra đơn vị nguyên liệu.',
  RECIPE_YIELD_UNIT_MISMATCH:
    'Đơn vị thành phẩm của công thức không khớp với món. Nội dung được giữ; nhờ quản lý kiểm tra công thức.',
  INSUFFICIENT_AVAILABLE_STOCK:
    'Không đủ nguyên liệu khả dụng để nhận món. Nội dung được giữ; tải lại thực đơn và nhờ quản lý kiểm tra tồn kho trước khi gửi lại.',
  INVENTORY_DEFAULT_WAREHOUSE_REQUIRED:
    'Chưa có kho mặc định hợp lệ để nhận món. Nội dung được giữ; nhờ quản lý cấu hình kho mặc định.',
  INVALID_RECIPE_SNAPSHOT_DATA:
    'Dữ liệu công thức chưa hợp lệ để nhận món. Nội dung được giữ; nhờ quản lý kiểm tra công thức.',
  RECIPE_USAGE_QUANTITY_OUT_OF_RANGE:
    'Lượng nguyên liệu cần dùng vượt giới hạn cho phép. Nội dung được giữ; kiểm tra số lượng món và công thức với quản lý.',
  ORDER_ITEM_RECIPE_SNAPSHOT_CONFLICT:
    'Dữ liệu công thức đã chốt của dòng món không nhất quán. Giữ nội dung đang nhập, tải lại đơn và liên hệ quản lý; không tự gửi lại thao tác.',
  ORDER_CURRENCY_MISMATCH: 'Tiền tệ hiện tại khác đơn cũ, không thể thêm món vào đơn này.',
  ORDER_HAS_FINANCIAL_OBLIGATIONS: 'Đơn có nghĩa vụ thanh toán, chưa thể hủy.',
  DINE_IN_SESSION_REQUIRED: 'Đơn tại bàn cần phiên OPEN thật.',
  TAKEAWAY_SESSION_NOT_ALLOWED: 'Đơn mang đi không được có phiên bàn.',
  UNSUPPORTED_ORDER_SOURCE: 'Kênh gọi món không hợp lệ.',
  ORDER_AMOUNT_LIMIT_EXCEEDED: 'Tổng tiền vượt giới hạn.',
  ORDER_BUSY: 'Thao tác đang xử lý. Vui lòng chờ.',
  ORDER_RESULT_UNCERTAIN: 'Chưa xác định kết quả. Hãy tải lại hoặc kiểm tra yêu cầu ban đầu.',
  EMPTY_UPDATE_REQUEST: 'Chưa có thay đổi.',
}
// These acceptance failures roll back the whole command. They are not stale-order
// conflicts or uncertain outcomes, and never justify a manual/recipe fallback.
const acceptanceRefusals = new Set([
  'ACTIVE_RECIPE_REQUIRED',
  'RECIPE_INGREDIENT_UNAVAILABLE',
  'RECIPE_INGREDIENT_UNIT_MISMATCH',
  'RECIPE_YIELD_UNIT_MISMATCH',
  'INSUFFICIENT_AVAILABLE_STOCK',
  'INVENTORY_DEFAULT_WAREHOUSE_REQUIRED',
  'INVALID_RECIPE_SNAPSHOT_DATA',
  'RECIPE_USAGE_QUANTITY_OUT_OF_RANGE',
])
export function isOrderAcceptanceRefusal(error: unknown) {
  const failure = orderError(error)
  return failure.status === 409 && acceptanceRefusals.has(failure.code)
}
export function orderError(error: unknown): NormalizedApiError {
  if (error instanceof ZodError)
    return {
      code: 'VALIDATION_ERROR',
      message: error.issues.map((i) => i.message).join('\n'),
      fieldErrors: Object.fromEntries(error.issues.map((i) => [i.path.join('.'), i.message])),
      isNetworkError: false,
    }
  const rawCode =
    axios.isAxiosError(error) && error.code === 'ORDER_ACCESS_CHANGED'
      ? error.code
      : error instanceof Error && error.message in messages
        ? error.message
        : undefined
  const result = rawCode
    ? { code: rawCode, message: messages[rawCode], fieldErrors: {}, isNetworkError: false }
    : normalizeApiError(error)
  return { ...result, message: messages[result.code] ?? result.message }
}
export const unresolvedResult = (error: unknown) => {
  const f = orderError(error)
  return (
    f.isNetworkError ||
    (!f.status && !['VALIDATION_ERROR', 'INVALID_IDEMPOTENCY_KEY', 'ORDER_ACCESS_CHANGED'].includes(f.code)) ||
    (f.status !== undefined && f.status >= 500) ||
    ['IDEMPOTENCY_KEY_REUSED', 'PAYMENT_IDEMPOTENCY_KEY_REUSED'].includes(f.code)
  )
}
