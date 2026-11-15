import { api } from '../../../shared/api/httpClient'
import type { AuthResponse, CurrentEntitlement, LoginRequest, MeResponse, RegisterRestaurantRequest } from '../../../shared/types/auth'

/**
 * The backend puts the refresh token in an HttpOnly cookie (and leaves it out of the JSON) when asked with this
 * header; credentials must be included so the cookie is stored and sent back.
 */
export const AUTH_TRANSPORT_HEADER = 'X-Auth-Transport'
const cookieTransport = { withCredentials: true, headers: { [AUTH_TRANSPORT_HEADER]: 'cookie' } }

export const authApi = {
  login: (body: LoginRequest) => api.post<AuthResponse>('/auth/login', body, cookieTransport).then((response) => response.data),
  refresh: () => api.post<AuthResponse>('/auth/refresh', undefined, cookieTransport).then((response) => response.data),
  me: () => api.get<MeResponse>('/auth/me').then((response) => response.data),
  logout: () => api.post<void>('/auth/logout', undefined, cookieTransport).then((response) => response.data),
  registerRestaurant: (body: RegisterRestaurantRequest) =>
    api.post<AuthResponse>('/auth/register-restaurant', body, cookieTransport).then((response) => response.data),
  entitlements: () => api.get<CurrentEntitlement>('/me/entitlements').then((response) => response.data),
}
