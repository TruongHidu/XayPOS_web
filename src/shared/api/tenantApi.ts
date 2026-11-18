import type { z } from 'zod'
import { api } from './httpClient'
import { ensureRequestScope } from './requestScope'
import { tenantRequest } from './tenantRequest'
import { parseTenantResponse } from './parseTenantResponse'

/**
 * Thin helpers for restaurant (tenant) endpoints. Every call is bound to the
 * tenant scope it was started in: a response arriving after logout/role change
 * is dropped (ORDER_ACCESS_CHANGED) and every body is validated with zod.
 */

type Params = Record<string, string | number | boolean | undefined | null>

const cleanParams = (params?: Params) =>
  params
    ? Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''))
    : undefined

export async function tenantGet<T>(
  scope: string,
  url: string,
  schema: z.ZodType<T>,
  options: { params?: Params; signal?: AbortSignal; code?: string; noContent?: 'null' } = {},
): Promise<T> {
  const config = tenantRequest(scope, options.signal)
  const response = await api.get<unknown>(url, { ...config, params: cleanParams(options.params) })
  ensureRequestScope(config)
  return parseTenantResponse(schema, response.data, options.code)
}

/** GET that answers 204 or 404 `notFoundCode` when the resource is absent. */
export async function tenantGetOptional<T>(
  scope: string,
  url: string,
  schema: z.ZodType<T>,
  options: { params?: Params; signal?: AbortSignal; code?: string; notFoundCodes?: string[] } = {},
): Promise<T | null> {
  const config = tenantRequest(scope, options.signal)
  try {
    const response = await api.get<unknown>(url, { ...config, params: cleanParams(options.params) })
    ensureRequestScope(config)
    if (response.status === 204) return null
    return parseTenantResponse(schema, response.data, options.code)
  } catch (error) {
    const data = (error as { response?: { status?: number; data?: { code?: string } } }).response
    if (data?.status === 404 && options.notFoundCodes?.includes(data.data?.code ?? '')) {
      ensureRequestScope(config)
      return null
    }
    throw error
  }
}

export async function tenantSend<T>(
  scope: string,
  method: 'post' | 'put' | 'patch',
  url: string,
  body: unknown,
  schema: z.ZodType<T>,
  options: { headers?: Record<string, string>; code?: string; params?: Params } = {},
): Promise<T> {
  const config = tenantRequest(scope)
  const response = await api.request<unknown>({
    ...config,
    method,
    url,
    data: body,
    params: cleanParams(options.params),
    headers: options.headers,
  })
  ensureRequestScope(config)
  return parseTenantResponse(schema, response.data, options.code)
}

/**
 * Like `tenantSend`, but also returns the HTTP status and lower-cased headers
 * (e.g. `idempotency-replayed`) for endpoints whose replay must be told apart.
 */
export async function tenantSendWithHeaders<T>(
  scope: string,
  method: 'post' | 'put' | 'patch',
  url: string,
  body: unknown,
  schema: z.ZodType<T>,
  options: { headers?: Record<string, string>; code?: string; params?: Params } = {},
): Promise<{ data: T; status: number; headers: Record<string, string> }> {
  const config = tenantRequest(scope)
  const response = await api.request<unknown>({
    ...config,
    method,
    url,
    data: body,
    params: cleanParams(options.params),
    headers: options.headers,
  })
  ensureRequestScope(config)
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(response.headers ?? {})) if (value !== undefined && value !== null) headers[name.toLowerCase()] = String(value)
  return { data: parseTenantResponse(schema, response.data, options.code), status: response.status, headers }
}

/** Mutation without a response body (DELETE …?expectedVersion=, 204). */
export async function tenantSendVoid(
  scope: string,
  method: 'post' | 'put' | 'patch' | 'delete',
  url: string,
  options: { body?: unknown; params?: Params; headers?: Record<string, string> } = {},
): Promise<void> {
  const config = tenantRequest(scope)
  await api.request({ ...config, method, url, data: options.body, params: cleanParams(options.params), headers: options.headers })
  ensureRequestScope(config)
}

/** Authenticated binary download (QR images/cards). */
export async function tenantBlob(scope: string, url: string, params?: Params, signal?: AbortSignal): Promise<Blob> {
  const config = tenantRequest(scope, signal)
  // arraybuffer (not blob) works the same in every browser and in the jsdom test transport.
  const response = await api.get<ArrayBuffer>(url, { ...config, params: cleanParams(params), responseType: 'arraybuffer' })
  ensureRequestScope(config)
  const type = String(response.headers['content-type'] ?? 'application/octet-stream')
  return new Blob([response.data], { type })
}

export const enc = encodeURIComponent
