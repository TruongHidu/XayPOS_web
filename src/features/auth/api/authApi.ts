import { api } from '../../../shared/api/httpClient'
import type { AuthResponse, CurrentEntitlement, LoginRequest, LogoutRequest, MeResponse, RefreshRequest, RegisterRestaurantRequest } from '../../../shared/types/auth'

export const authApi = {
  login: (body: LoginRequest) => api.post<AuthResponse>('/auth/login', body).then((response) => response.data),
  refresh: (body: RefreshRequest) => api.post<AuthResponse>('/auth/refresh', body).then((response) => response.data),
  me: () => api.get<MeResponse>('/auth/me').then((response) => response.data),
  logout: (body: LogoutRequest) => api.post<void>('/auth/logout', body).then((response) => response.data),
  registerRestaurant: (body: RegisterRestaurantRequest) => api.post<AuthResponse>('/auth/register-restaurant', body).then((response) => response.data),
  entitlements: () => api.get<CurrentEntitlement>('/me/entitlements').then((response) => response.data),
}
