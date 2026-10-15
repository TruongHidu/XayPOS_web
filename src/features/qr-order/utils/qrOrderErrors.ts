import axios from 'axios'
import { ZodError } from 'zod'
import type { QrOrderFailure } from '../types'
export class QrOrderError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}
const messages: Record<string, string> = {
  INVALID_QR_RESPONSE: 'Chưa xác minh được dữ liệu trả về. Vui lòng kiểm tra bằng yêu cầu ban đầu.',
  QR_SCOPE_CHANGED: 'Bạn đã chuyển sang lượt gọi món khác.',
  QR_GUEST_ACCESS_INVALID: 'Lượt gọi món đã hết hạn hoặc không còn hiệu lực. Vui lòng liên hệ nhân viên.',
  QR_ORDER_UNAVAILABLE: 'Nhà hàng hiện chưa nhận yêu cầu gọi món qua link này. Bạn vẫn có thể xem thực đơn.',
  QR_ORDER_REQUEST_NOT_FOUND: 'Không tìm thấy yêu cầu thuộc lượt gọi món này.',
  QR_ORDER_CHECKOUT_IN_PROGRESS: 'Bàn đang thanh toán, hiện không nhận thêm món. Vui lòng liên hệ nhân viên.',
  ITEM_OUT_OF_STOCK: 'Một món trong giỏ vừa hết hàng. Kiểm tra thực đơn và sửa giỏ trước khi gửi lại.',
  ITEM_NOT_SELLABLE: 'Một món trong giỏ không còn được bán. Vui lòng kiểm tra lại thực đơn.',
  IDEMPOTENCY_KEY_REUSED:
    'Yêu cầu có xung đột. Giữ nguyên nội dung và liên hệ nhân viên để kiểm tra, tránh gọi trùng món.',
  CONCURRENT_QR_REQUEST_UPDATE: 'Yêu cầu đã thay đổi. Vui lòng kiểm tra lại kết quả.',
  QR_REQUEST_BODY_TOO_LARGE: 'Nội dung quá dài. Vui lòng giảm ghi chú hoặc số dòng món.',
  ORDER_AMOUNT_LIMIT_EXCEEDED: 'Tổng dự kiến vượt giới hạn. Vui lòng điều chỉnh giỏ.',
  QR_RATE_LIMIT_EXCEEDED: 'Bạn thao tác quá nhanh. Vui lòng chờ trước khi thử lại.',
  QR_GUEST_BUSY: 'Đang chuẩn bị lượt gọi món. Vui lòng chờ.',
  INVALID_QUANTITY: 'Số lượng từ 0,001 đến 20, tối đa 3 chữ số thập phân.',
  INVALID_DECIMAL: 'Số lượng hoặc số tiền không đúng định dạng.',
  QR_RANDOM_UNAVAILABLE:
    'Trình duyệt chưa hỗ trợ tạo yêu cầu an toàn. Vui lòng dùng trình duyệt mới hoặc liên hệ nhân viên.',
}
export function retryAfter(value: unknown, now = Date.now()) {
  if (typeof value !== 'string' && typeof value !== 'number') return now + 30000
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0
    ? now + seconds * 1000
    : Math.max(now, Date.parse(String(value)) || now + 30000)
}
export function qrOrderError(error: unknown): QrOrderFailure {
  if (error instanceof ZodError)
    return {
      code: 'VALIDATION_ERROR',
      message: error.issues.map((issue) => issue.message).join('\n'),
      fieldErrors: Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message])),
      unknownOutcome: false,
    }
  if (error instanceof QrOrderError)
    return {
      code: error.code,
      message: messages[error.code] ?? error.code,
      fieldErrors: {},
      unknownOutcome: error.code === 'INVALID_QR_RESPONSE',
    }
  if (error instanceof Error && ['INVALID_QUANTITY', 'INVALID_DECIMAL'].includes(error.message))
    return {
      code: 'VALIDATION_ERROR',
      message: messages[error.message],
      fieldErrors: {},
      unknownOutcome: false,
    }
  if (axios.isAxiosError(error)) {
    if (!error.response)
      return {
        code: 'NETWORK_ERROR',
        message: 'Không thể kết nối máy chủ. Vui lòng kiểm tra lại kết nối.',
        fieldErrors: {},
        unknownOutcome: true,
      }
    const body = error.response.data as
      { code?: string; fieldErrors?: Record<string, string>; details?: Record<string, string> } | undefined
    const status = error.response.status
    const code = body?.code ?? `HTTP_${status}`
    return {
      code,
      status,
      message:
        messages[code] ??
        (status === 400
          ? 'Thông tin gửi chưa hợp lệ. Vui lòng kiểm tra lại.'
          : 'Nhà hàng chưa xử lý được yêu cầu. Vui lòng thử lại sau.'),
      fieldErrors: body?.fieldErrors ?? body?.details ?? {},
      unknownOutcome: status >= 500 || code === 'IDEMPOTENCY_KEY_REUSED',
      retryAt: status === 429 ? retryAfter(error.response.headers['retry-after']) : undefined,
    }
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: 'Chưa xác minh được kết quả. Vui lòng kiểm tra lại yêu cầu.',
    fieldErrors: {},
    unknownOutcome: true,
  }
}
