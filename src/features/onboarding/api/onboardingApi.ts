import { z } from 'zod'
import { api } from '../../../shared/api/httpClient'
import { idempotencyHeaders } from '../../../shared/api/idempotency'
import { parseTenantResponse } from '../../../shared/api/parseTenantResponse'
import { publicApi } from '../../../shared/api/publicHttpClient'
import {
  catalogPackageSchema,
  currentAttemptSchema,
  paymentAttemptSchema,
  onboardingStatusSchema,
  purchasePageSchema,
  purchaseViewSchema,
  restaurantProfileSchema,
  type RestaurantFormValues,
} from '../schemas'

const parsePurchase = (value: unknown) => parseTenantResponse(purchaseViewSchema, value, 'INVALID_PURCHASE_RESPONSE')
const parseProfile = (value: unknown) => parseTenantResponse(restaurantProfileSchema, value, 'INVALID_RESTAURANT_RESPONSE')

export const onboardingApi = {
  packages: (signal?: AbortSignal) =>
    publicApi
      .get<unknown>('/packages', { signal })
      .then((response) => parseTenantResponse(z.array(catalogPackageSchema), response.data, 'INVALID_PACKAGE_RESPONSE')),
  status: (signal?: AbortSignal) =>
    api
      .get<unknown>('/subscriptions/onboarding', { signal })
      .then((response) => parseTenantResponse(onboardingStatusSchema, response.data, 'INVALID_ONBOARDING_RESPONSE')),
  restaurant: (signal?: AbortSignal) => api.get<unknown>('/restaurants/me', { signal }).then((response) => parseProfile(response.data)),
  updateRestaurant: (body: RestaurantFormValues) => api.patch<unknown>('/restaurants/me', body).then((response) => parseProfile(response.data)),
  purchases: (signal?: AbortSignal) =>
    api
      .get<unknown>('/subscription-purchases', { params: { page: 0, size: 10 }, signal })
      .then((response) => parseTenantResponse(purchasePageSchema, response.data, 'INVALID_PURCHASE_RESPONSE')),
  purchase: (purchaseId: string, signal?: AbortSignal) =>
    api.get<unknown>(`/subscription-purchases/${encodeURIComponent(purchaseId)}`, { signal }).then((response) => parsePurchase(response.data)),
  createPurchase: (packageCode: string, idempotencyKey: string) =>
    api
      .post<unknown>('/subscription-purchases', { packageCode }, { headers: idempotencyHeaders(idempotencyKey) })
      .then((response) => parsePurchase(response.data)),
  currentAttempt: (purchaseId: string, signal?: AbortSignal) =>
    api
      .get<unknown>(`/subscription-purchases/${encodeURIComponent(purchaseId)}/payment-attempts/current`, { signal })
      .then((response) => parseTenantResponse(currentAttemptSchema, response.data, 'INVALID_PAYMENT_RESPONSE')),
  createAttempt: (purchaseId: string, idempotencyKey: string) =>
    api
      .post<unknown>(`/subscription-purchases/${encodeURIComponent(purchaseId)}/payment-attempts`, {}, { headers: idempotencyHeaders(idempotencyKey) })
      .then((response) => parseTenantResponse(paymentAttemptSchema, response.data, 'INVALID_PAYMENT_RESPONSE')),
  cancelPurchase: (purchaseId: string, expectedVersion: number) =>
    api
      .post<unknown>(`/subscription-purchases/${encodeURIComponent(purchaseId)}/cancel`, { expectedVersion })
      .then((response) => parsePurchase(response.data)),
}
