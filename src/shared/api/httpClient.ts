import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { env } from '../config/env'
import { normalizeApiError } from '../errors/normalizeApiError'
import { tokenStorage } from '../storage/tokenStorage'

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean }
const authPaths = ['/auth/login', '/auth/register-restaurant', '/auth/refresh', '/auth/logout']
const nonRefreshCodes = new Set(['FORBIDDEN', 'SUBSCRIPTION_NOT_ACTIVE', 'FEATURE_NOT_ENTITLED', 'TENANT_ACCESS_DENIED'])

export const api = axios.create({ baseURL: env.apiBaseUrl, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } })

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let accessToken: string | null = null
export const getAccessToken = () => accessToken
export const setAccessToken = (token: string | null) => { accessToken = token }

let refreshSingleFlight: Promise<string> | null = null
export function resetRefreshCoordinator() { refreshSingleFlight = null }
export function refreshWithCoordinator(): Promise<string> {
  if (!refreshSingleFlight) {
    refreshSingleFlight = import('../../features/auth/store/authStore').then(({ useAuthStore }) => useAuthStore.getState().refreshSession()).then((response) => response.accessToken).finally(() => { refreshSingleFlight = null })
  }
  return refreshSingleFlight
}

function isAuthenticationStyle403(error: AxiosError) {
  const normalized = normalizeApiError(error)
  return error.response?.status === 403 && !('code' in ((error.response?.data ?? {}) as object)) && normalized.code.startsWith('HTTP_403')
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetryConfig | undefined
  const path = config?.url ?? ''
  const normalized = normalizeApiError(error)
  const shouldRefresh = Boolean(config && !config._retry && !authPaths.some((item) => path.includes(item)) && (error.response?.status === 401 || isAuthenticationStyle403(error)) && !nonRefreshCodes.has(normalized.code))
  if (!shouldRefresh || !config) return Promise.reject(error)
  config._retry = true
  try {
    const token = await refreshWithCoordinator()
    config.headers.Authorization = `Bearer ${token}`
    return api(config)
  } catch (refreshError) {
    return Promise.reject(refreshError)
  }
})

export { tokenStorage }
