import { api } from '../../../shared/api/httpClient'
import type { PageResponse } from '../../../shared/types/auth'
import type { AdminSubscriptionSummary, ChangePackageRequest, CreateSubscriptionRequest, RestaurantSubscriptionCriteria, SubscriptionListCriteria, SubscriptionResponse } from '../../../shared/types/admin'

const basePath = (restaurantId: string) => `/admin/restaurants/${encodeURIComponent(restaurantId)}/subscriptions`

export const adminSubscriptionsApi = {
  list: (criteria: SubscriptionListCriteria) => api.get<PageResponse<AdminSubscriptionSummary>>('/admin/subscriptions', { params: compactCriteria(criteria) }).then((response) => response.data),
  listByRestaurant: (restaurantId: string, criteria: RestaurantSubscriptionCriteria) => api.get<PageResponse<SubscriptionResponse>>(basePath(restaurantId), { params: compactCriteria(criteria) }).then((response) => response.data),
  getById: (restaurantId: string, subscriptionId: string) => api.get<SubscriptionResponse>(`${basePath(restaurantId)}/${encodeURIComponent(subscriptionId)}`).then((response) => response.data),
  create: (restaurantId: string, request: CreateSubscriptionRequest) => api.post<SubscriptionResponse>(basePath(restaurantId), request).then((response) => response.data),
  activate: (restaurantId: string, subscriptionId: string) => api.post<SubscriptionResponse>(`${basePath(restaurantId)}/${encodeURIComponent(subscriptionId)}/activate`).then((response) => response.data),
  changePackage: (restaurantId: string, subscriptionId: string, request: ChangePackageRequest) => api.post<SubscriptionResponse>(`${basePath(restaurantId)}/${encodeURIComponent(subscriptionId)}/change-package`, request).then((response) => response.data),
  cancel: (restaurantId: string, subscriptionId: string) => api.post<SubscriptionResponse>(`${basePath(restaurantId)}/${encodeURIComponent(subscriptionId)}/cancel`).then((response) => response.data),
}

function compactCriteria(criteria: SubscriptionListCriteria | RestaurantSubscriptionCriteria) { return Object.fromEntries(Object.entries(criteria).filter(([, value]) => value !== '')) }
