import { parseTenantResponse } from '../../../shared/api/parseTenantResponse'
import { api } from '../../../shared/api/httpClient'
import { ensureRequestScope } from '../../../shared/api/requestScope'
import { idempotencyHeaders } from '../../../shared/api/idempotency'
import type {
  CreateOrderInput,
  OrderCriteria,
  UpdateOrderInput,
  UpdateLineInput,
  AddItemsInput,
  CancelInput,
} from '../types'
import {
  addItemsSchema,
  cancelSchema,
  createOrderSchema,
  itemTransitionSchema,
  orderCriteriaSchema,
  orderPageSchema,
  orderSchema,
  updateLineSchema,
  updateOrderSchema,
  versionRequestSchema,
} from '../schemas'
import { orderRequest } from './orderRequest'
const idPath = (id: string) => '/orders/' + encodeURIComponent(id)
export const ordersApi = {
  async list(scope: string, criteria: OrderCriteria, signal?: AbortSignal) {
    const config = orderRequest(scope, signal)
    const response = await api.get<unknown>('/orders', { ...config, params: orderCriteriaSchema.parse(criteria) })
    ensureRequestScope(config)
    return parseTenantResponse(orderPageSchema, response.data, 'INVALID_ORDER_RESPONSE')
  },
  async detail(scope: string, id: string, signal?: AbortSignal) {
    const config = orderRequest(scope, signal)
    const response = await api.get<unknown>(idPath(id), config)
    ensureRequestScope(config)
    return parseTenantResponse(orderSchema, response.data, 'INVALID_ORDER_RESPONSE')
  },
  async create(scope: string, input: CreateOrderInput, key: string) {
    const headers = idempotencyHeaders(key)
    const config = orderRequest(scope)
    const response = await api.post('/orders', createOrderSchema.parse(input), {
      ...config,
      headers,
    })
    ensureRequestScope(config)
    return {
      order: parseTenantResponse(orderSchema, response.data, 'INVALID_ORDER_RESPONSE'),
      replayed: response.headers['idempotency-replayed'] === 'true',
    }
  },
  update: (scope: string, id: string, input: UpdateOrderInput) =>
    mutate(scope, 'PATCH', idPath(id), updateOrderSchema.parse(input)),
  async active(scope: string, sessionId: string, signal?: AbortSignal) {
    const config = orderRequest(scope, signal)
    const response = await api.get<unknown>(
      '/table-sessions/' + encodeURIComponent(sessionId) + '/active-order',
      config,
    )
    ensureRequestScope(config)
    return response.status === 204 ? null : parseTenantResponse(orderSchema, response.data, 'INVALID_ORDER_RESPONSE')
  },
  async add(scope: string, id: string, input: AddItemsInput, key?: string) {
    const data = addItemsSchema.parse(input)
    const headers = data.submissionMode === 'SUBMIT' ? idempotencyHeaders(key ?? '') : undefined
    const config = orderRequest(scope)
    const response = await api.post(idPath(id) + '/items', data, { ...config, headers })
    ensureRequestScope(config)
    return {
      order: parseTenantResponse(orderSchema, response.data, 'INVALID_ORDER_RESPONSE'),
      replayed: response.headers['idempotency-replayed'] === 'true',
    }
  },
  updateLine: (scope: string, id: string, lineId: string, input: UpdateLineInput) =>
    mutate(scope, 'PATCH', idPath(id) + '/items/' + encodeURIComponent(lineId), updateLineSchema.parse(input)),
  confirm: (scope: string, id: string, expectedVersion: number) =>
    mutate(scope, 'POST', idPath(id) + '/confirm', versionRequestSchema.parse({ expectedVersion })),
  cancelLine: (scope: string, id: string, lineId: string, input: CancelInput) =>
    mutate(scope, 'POST', idPath(id) + '/items/' + encodeURIComponent(lineId) + '/cancel', cancelSchema.parse(input)),
  cancel: (scope: string, id: string, input: CancelInput) =>
    mutate(scope, 'POST', idPath(id) + '/cancel', cancelSchema.parse(input)),
  startCooking: (scope: string, id: string, lineId: string, expectedOrderVersion: number) =>
    transition(scope, id, lineId, 'start-cooking', expectedOrderVersion),
  markReady: (scope: string, id: string, lineId: string, expectedOrderVersion: number) =>
    transition(scope, id, lineId, 'mark-ready', expectedOrderVersion),
  markServed: (scope: string, id: string, lineId: string, expectedOrderVersion: number) =>
    transition(scope, id, lineId, 'mark-served', expectedOrderVersion),
  complete: (scope: string, id: string, expectedVersion: number) =>
    mutate(scope, 'POST', idPath(id) + '/complete', versionRequestSchema.parse({ expectedVersion })),
}
function transition(scope: string, id: string, lineId: string, action: string, expectedOrderVersion: number) {
  return mutate(
    scope,
    'POST',
    idPath(id) + '/items/' + encodeURIComponent(lineId) + '/' + action,
    itemTransitionSchema.parse({ expectedOrderVersion }),
  )
}
async function mutate(scope: string, method: 'POST' | 'PATCH', url: string, data: unknown) {
  const config = orderRequest(scope)
  const response = await api.request({ ...config, method, url, data })
  ensureRequestScope(config)
  return parseTenantResponse(orderSchema, response.data, 'INVALID_ORDER_RESPONSE')
}
