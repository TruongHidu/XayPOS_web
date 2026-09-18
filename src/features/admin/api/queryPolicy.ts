import { normalizeApiError } from '../../../shared/errors/normalizeApiError'

export const retryAdminQuery = (failureCount: number, error: unknown) => {
  const normalized = normalizeApiError(error)
  return normalized.isNetworkError || (normalized.status !== undefined && normalized.status >= 500) ? failureCount < 2 : false
}
