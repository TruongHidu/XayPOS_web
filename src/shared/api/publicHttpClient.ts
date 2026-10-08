import axios from 'axios'
import { env } from '../config/env'

/**
 * Public Axios instance for unauthenticated customer-facing endpoints.
 *
 * - No Authorization header, no token storage, no refresh logic.
 * - withCredentials: false — no cookies.
 * - Supports AbortSignal via Axios signal option.
 */
export const publicApi = axios.create({
  baseURL: env.apiBaseUrl,
  headers: { Accept: 'application/json' },
  withCredentials: false,
  timeout: 15_000,
})
