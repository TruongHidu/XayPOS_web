import axios from 'axios'
import type { NormalizedApiError } from '../types/auth'

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  RESTAURANT_INACTIVE: 'Nhà hàng hiện không hoạt động. Vui lòng liên hệ quản trị viên.',
  INVALID_REFRESH_TOKEN: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  SUBSCRIPTION_NOT_ACTIVE: 'Subscription của nhà hàng chưa hoạt động.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
}

export function normalizeApiError(error: unknown): NormalizedApiError {
  if (!axios.isAxiosError(error)) return { code: 'UNKNOWN_ERROR', message: 'Đã xảy ra lỗi. Vui lòng thử lại.', fieldErrors: {}, isNetworkError: false }
  if (!error.response) return { code: 'NETWORK_ERROR', message: 'Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại.', fieldErrors: {}, isNetworkError: true }
  const data: unknown = error.response.data
  if (typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>
    const code = typeof record.code === 'string' ? record.code : `HTTP_${error.response.status}`
    const fieldErrors = typeof record.fieldErrors === 'object' && record.fieldErrors !== null ? record.fieldErrors as Record<string, string> : {}
    const message = messages[code] ?? (typeof record.message === 'string' && record.message !== 'Forbidden' ? record.message : 'Máy chủ không thể xử lý yêu cầu.')
    return { status: error.response.status, code, message, fieldErrors, isNetworkError: false }
  }
  return { status: error.response.status, code: `HTTP_${error.response.status}`, message: 'Máy chủ không thể xử lý yêu cầu.', fieldErrors: {}, isNetworkError: false }
}

export function errorCode(error: unknown): string { return normalizeApiError(error).code }
