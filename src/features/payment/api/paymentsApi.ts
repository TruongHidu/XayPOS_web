import { api } from '../../../shared/api/httpClient'
import { tenantRequest } from '../../../shared/api/tenantRequest'
import { ensureRequestScope } from '../../../shared/api/requestScope'
import { parseTenantResponse } from '../../../shared/api/parseTenantResponse'
import { idempotencyHeaders } from '../../../shared/api/idempotency'
import {
  paymentCriteriaSchema,
  paymentInputSchema,
  paymentPageSchema,
  paymentSchema,
  type PaymentInput,
} from '../schemas'

const path = (orderId: string) => '/orders/' + encodeURIComponent(orderId) + '/payments'
export const paymentsApi = {
  // The caller freezes this body/key after reading the latest order. Replay must not rebuild them.
  async record(scope: string, orderId: string, input: PaymentInput, key: string) {
    const data = paymentInputSchema.parse(input)
    const headers = idempotencyHeaders(key)
    const config = tenantRequest(scope)
    const response = await api.post(path(orderId), data, { ...config, headers })
    ensureRequestScope(config)
    return {
      payment: parseTenantResponse(paymentSchema, response.data, 'INVALID_PAYMENT_RESPONSE'),
      replayed: response.headers['idempotency-replayed'] === 'true',
    }
  },
  async list(scope: string, orderId: string, criteria: { page?: number; size?: number } = {}, signal?: AbortSignal) {
    const params = paymentCriteriaSchema.parse(criteria)
    const config = tenantRequest(scope, signal)
    const response = await api.get<unknown>(path(orderId), { ...config, params })
    ensureRequestScope(config)
    return parseTenantResponse(paymentPageSchema, response.data, 'INVALID_PAYMENT_RESPONSE')
  },
  async detail(scope: string, orderId: string, paymentId: string, signal?: AbortSignal) {
    const config = tenantRequest(scope, signal)
    const response = await api.get<unknown>(path(orderId) + '/' + encodeURIComponent(paymentId), config)
    ensureRequestScope(config)
    return parseTenantResponse(paymentSchema, response.data, 'INVALID_PAYMENT_RESPONSE')
  },
}
