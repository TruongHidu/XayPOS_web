import { AxiosError, type AxiosRequestConfig } from 'axios'
declare module 'axios' {
  interface AxiosRequestConfig {
    isScopeCurrent?: () => boolean
  }
}
export function ensureRequestScope(config: AxiosRequestConfig) {
  if (config.isScopeCurrent && !config.isScopeCurrent()) {
    throw new AxiosError('ORDER_ACCESS_CHANGED', 'ORDER_ACCESS_CHANGED')
  }
}
