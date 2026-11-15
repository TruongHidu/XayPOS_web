import axios from 'axios'
import { ZodError } from 'zod'
import { normalizeApiError } from './normalizeApiError'
import type { NormalizedApiError } from '../types/auth'

/**
 * Error messages for restaurant management modules.
 *
 * Each module keeps its own `utils/<module>Errors.ts` map and registers it once:
 *   registerTenantErrors({ MENU_ITEM_NOT_FOUND: 'Không tìm thấy món.' })
 * Pages then show `tenantError(error).message` (or `toast.error(tenantError(e).message)`).
 * The order feature keeps its richer `orderError` (uncertain-result rules).
 */

const common: Record<string, string> = {
  ORDER_ACCESS_CHANGED: 'Phiên làm việc hoặc quyền truy cập đã thay đổi. Tải lại trang để tiếp tục.',
  INVALID_TENANT_RESPONSE: 'Dữ liệu máy chủ trả về không hợp lệ. Vui lòng tải lại.',
  VALIDATION_ERROR: 'Dữ liệu nhập chưa hợp lệ. Kiểm tra lại các trường được đánh dấu.',
  CONCURRENT_UPDATE: 'Dữ liệu vừa được người khác cập nhật. Tải lại để xem bản mới nhất trước khi sửa tiếp.',
  OPTIMISTIC_LOCK_CONFLICT: 'Dữ liệu vừa được người khác cập nhật. Tải lại để xem bản mới nhất trước khi sửa tiếp.',
  VERSION_CONFLICT: 'Dữ liệu vừa được người khác cập nhật. Tải lại để xem bản mới nhất trước khi sửa tiếp.',
  IDEMPOTENCY_KEY_REUSED: 'Thao tác này đã được gửi trước đó với nội dung khác. Tải lại để kiểm tra kết quả.',
  FEATURE_NOT_ENTITLED: 'Gói dịch vụ hiện tại không có chức năng này.',
  SUBSCRIPTION_NOT_ACTIVE: 'Gói dịch vụ của nhà hàng chưa hoạt động.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  TENANT_ACCESS_DENIED: 'Bạn không có quyền truy cập dữ liệu của nhà hàng này.',
}

const registered: Record<string, string> = {}

/** Adds a module's code → message map (later registrations win for the same code). */
export function registerTenantErrors(messages: Record<string, string>) {
  Object.assign(registered, messages)
}

const messageFor = (code: string) => registered[code] ?? common[code]

const CONFLICT_CODES = new Set(['CONCURRENT_UPDATE', 'OPTIMISTIC_LOCK_CONFLICT', 'VERSION_CONFLICT'])

export function tenantError(error: unknown): NormalizedApiError {
  if (error instanceof ZodError)
    return {
      code: 'VALIDATION_ERROR',
      message: error.issues.map((issue) => issue.message).join('\n'),
      fieldErrors: Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message])),
      isNetworkError: false,
    }
  if (axios.isAxiosError(error) && error.code === 'ORDER_ACCESS_CHANGED')
    return { code: error.code, message: common.ORDER_ACCESS_CHANGED, fieldErrors: {}, isNetworkError: false }
  // parseTenantResponse throws `new Error('INVALID_<MODULE>_RESPONSE')`.
  if (!axios.isAxiosError(error) && error instanceof Error && /^INVALID_[A-Z_]+_RESPONSE$/.test(error.message))
    return {
      code: error.message,
      message: messageFor(error.message) ?? common.INVALID_TENANT_RESPONSE,
      fieldErrors: {},
      isNetworkError: false,
    }
  const normalized = normalizeApiError(error)
  return { ...normalized, message: messageFor(normalized.code) ?? normalized.message }
}

/** True when a save failed because someone else changed the record (show "Tải lại"). */
export const isConflictError = (error: unknown) => {
  const normalized = tenantError(error)
  return normalized.status === 409 && (CONFLICT_CODES.has(normalized.code) || normalized.code.startsWith('CONCURRENT_'))
}
