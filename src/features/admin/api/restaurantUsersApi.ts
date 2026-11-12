import { api } from '../../../shared/api/httpClient'
import type { PageResponse } from '../../../shared/types/auth'
import type { AdminRestaurantUser, RestaurantUserCriteria } from '../../../shared/types/admin'
import type { TemporaryPasswordResponse } from '../../../shared/types/adminPayments'

const basePath = (restaurantId: string) => `/admin/restaurants/${encodeURIComponent(restaurantId)}/users`

export const restaurantUsersApi = {
  list: (restaurantId: string, criteria: RestaurantUserCriteria) => {
    const normalized = { ...criteria, q: criteria.q.trim(), roleCode: criteria.roleCode.trim().toUpperCase() }
    const params = Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== ''))
    return api
      .get<PageResponse<AdminRestaurantUser>>(basePath(restaurantId), { params })
      .then((response) => response.data)
  },
  getById: (restaurantId: string, userId: string) =>
    api
      .get<AdminRestaurantUser>(`${basePath(restaurantId)}/${encodeURIComponent(userId)}`)
      .then((response) => response.data),
  updateStatus: (restaurantId: string, userId: string, request: { active: boolean; reason: string }) =>
    api
      .patch<AdminRestaurantUser>(`${basePath(restaurantId)}/${encodeURIComponent(userId)}/status`, request)
      .then((response) => response.data),
  issueTemporaryPassword: (restaurantId: string, userId: string, reason: string) =>
    api
      .post<TemporaryPasswordResponse>(`${basePath(restaurantId)}/${encodeURIComponent(userId)}/temporary-password`, { reason })
      .then((response) => response.data),
}
