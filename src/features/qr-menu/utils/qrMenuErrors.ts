import axios from 'axios'
import type { PublicQrMenuError } from '../types'

/**
 * Map an API error to a structured QR menu error for UI rendering.
 * Decisions are based on HTTP status + business error code, never on message string matching.
 */
export function mapQrMenuError(error: unknown): PublicQrMenuError {
  if (axios.isCancel(error)) {
    // Cancelled requests are not user-visible errors
    return { type: 'network', message: '', code: 'CANCELLED' }
  }

  if (!axios.isAxiosError(error) || !error.response) {
    return {
      type: 'network',
      message: 'Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại.',
    }
  }

  const status = error.response.status
  const data = error.response.data as Record<string, unknown> | undefined
  const code = typeof data?.code === 'string' ? data.code : undefined

  if (status === 400 && code === 'VALIDATION_ERROR') {
    return {
      type: 'validation',
      message: 'Điều kiện tìm kiếm không hợp lệ. Vui lòng thử lại.',
      code,
    }
  }

  if (status === 403 && code === 'QR_MENU_UNAVAILABLE') {
    return {
      type: 'unavailable',
      message: 'Thực đơn hiện chưa khả dụng. Vui lòng liên hệ nhân viên nhà hàng.',
      code,
    }
  }

  if (status === 404 && code === 'PUBLIC_MENU_GROUP_NOT_FOUND') {
    return {
      type: 'group_not_found',
      message: 'Nhóm món đã thay đổi. Đang tải lại thực đơn...',
      code,
    }
  }

  if (status === 404 && code === 'QR_MENU_NOT_FOUND') {
    return {
      type: 'not_found',
      message: 'Mã QR không hợp lệ hoặc không còn khả dụng. Vui lòng quét lại mã QR hoặc liên hệ nhân viên.',
      code,
    }
  }

  if (status === 404) {
    return {
      type: 'not_found',
      message: 'Mã QR không hợp lệ hoặc không còn khả dụng. Vui lòng quét lại mã QR hoặc liên hệ nhân viên.',
      code,
    }
  }

  if (status === 403) {
    return {
      type: 'unavailable',
      message: 'Thực đơn hiện chưa khả dụng. Vui lòng liên hệ nhân viên nhà hàng.',
      code,
    }
  }

  return {
    type: 'server',
    message: 'Đã xảy ra lỗi khi tải thực đơn. Vui lòng thử lại.',
    code,
  }
}

/** Returns true if the error represents a terminal state (menu definitely not accessible). */
export function isTerminalError(error: PublicQrMenuError): boolean {
  return error.type === 'not_found' || error.type === 'unavailable'
}

/** Returns true if the request was cancelled (not a user-visible error). */
export function isCancelledError(error: unknown): boolean {
  return axios.isCancel(error)
}
