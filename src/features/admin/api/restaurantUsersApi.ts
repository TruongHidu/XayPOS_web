import { api } from '../../../shared/api/httpClient'
import type { PageResponse } from '../../../shared/types/auth'
import type { AdminRestaurantUser, RestaurantUserCriteria } from '../../../shared/types/admin'

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
}
