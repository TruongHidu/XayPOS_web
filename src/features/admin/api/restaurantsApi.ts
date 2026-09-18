import { api } from '../../../shared/api/httpClient'
import type { PageResponse } from '../../../shared/types/auth'
import type { RestaurantDetailResponse, RestaurantListCriteria, RestaurantResponse, UpdateRestaurantStatusRequest } from '../../../shared/types/admin'

export const restaurantsApi = {
  list: (criteria: RestaurantListCriteria) => api.get<PageResponse<RestaurantResponse>>('/admin/restaurants', { params: compactCriteria(criteria) }).then((response) => response.data),
  getById: (restaurantId: string) => api.get<RestaurantDetailResponse>(`/admin/restaurants/${encodeURIComponent(restaurantId)}`).then((response) => response.data),
  updateStatus: (restaurantId: string, request: UpdateRestaurantStatusRequest) => api.patch<RestaurantDetailResponse>(`/admin/restaurants/${encodeURIComponent(restaurantId)}/status`, request).then((response) => response.data),
}

function compactCriteria(criteria: RestaurantListCriteria) { return Object.fromEntries(Object.entries(criteria).filter(([, value]) => value !== '')) }
