import { api } from '../../../shared/api/httpClient'
import type { FeatureEntitlement, FeatureResponse, PackageResponse, SubscriptionResponse, PageResponse } from '../../../shared/types/auth'

export const adminApi = {
  listFeatures: (includeInactive = true) => api.get<FeatureResponse[]>('/admin/features', { params: { includeInactive } }).then((r) => r.data),
  createFeature: (body: { code: string; name: string; description?: string }) => api.post<FeatureResponse>('/admin/features', body).then((r) => r.data),
  updateFeature: (code: string, body: { name: string; description?: string; active: boolean }) => api.put<FeatureResponse>(`/admin/features/${encodeURIComponent(code)}`, body).then((r) => r.data),
  listPackages: (includeInactive = true) => api.get<PackageResponse[]>('/admin/packages', { params: { includeInactive } }).then((r) => r.data),
  createPackage: (body: { code: string; name: string; description?: string; priceAmount: number; currencyCode: string; billingCycleMonths: number }) => api.post<PackageResponse>('/admin/packages', body).then((r) => r.data),
  updatePackage: (code: string, body: { name: string; description?: string; priceAmount: number; currencyCode: string; billingCycleMonths: number; active: boolean }) => api.put<PackageResponse>(`/admin/packages/${encodeURIComponent(code)}`, body).then((r) => r.data),
  attachFeature: (packageCode: string, featureCode: string, limits: Record<string, unknown> = {}) => api.post<PackageResponse>(`/admin/packages/${encodeURIComponent(packageCode)}/features/${encodeURIComponent(featureCode)}`, { limits }).then((r) => r.data),
  detachFeature: (packageCode: string, featureCode: string) => api.delete<PackageResponse>(`/admin/packages/${encodeURIComponent(packageCode)}/features/${encodeURIComponent(featureCode)}`).then((r) => r.data),
  createSubscription: (restaurantId: string, body: { packageCode: string; startAt: string; endAt: string; autoRenew: boolean; priceAmount: number; currencyCode: string }) => api.post<SubscriptionResponse>(`/admin/restaurants/${encodeURIComponent(restaurantId)}/subscriptions`, body).then((r) => r.data),
  activateSubscription: (restaurantId: string, subscriptionId: string) => api.post<SubscriptionResponse>(`/admin/restaurants/${encodeURIComponent(restaurantId)}/subscriptions/${encodeURIComponent(subscriptionId)}/activate`).then((r) => r.data),
  changePackage: (restaurantId: string, subscriptionId: string, body: { packageCode: string; endAt: string; autoRenew: boolean; priceAmount: number; currencyCode: string }) => api.post<SubscriptionResponse>(`/admin/restaurants/${encodeURIComponent(restaurantId)}/subscriptions/${encodeURIComponent(subscriptionId)}/change-package`, body).then((r) => r.data),
  cancelSubscription: (restaurantId: string, subscriptionId: string) => api.post<SubscriptionResponse>(`/admin/restaurants/${encodeURIComponent(restaurantId)}/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`).then((r) => r.data),
}

export const tenantSubscriptionApi = {
  current: () => api.get<SubscriptionResponse>('/subscriptions/current').then((r) => r.data),
  history: (page = 0, size = 20) => api.get<PageResponse<SubscriptionResponse>>('/subscriptions/history', { params: { page, size } }).then((r) => r.data),
}

export type AdminFeatureLimit = FeatureEntitlement
