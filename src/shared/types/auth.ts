import type { FeatureEntitlement } from './admin'

export type UserRole = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'WAITER' | 'KITCHEN' | 'CASHIER'
export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated'

export interface AuthUser {
  id: string
  restaurantId: string | null
  restaurantCode: string | null
  restaurantName: string | null
  name: string
  email: string
  phone: string | null
  role: UserRole
  permissions: string[]
}

export interface AuthResponse {
  accessToken: string
  /** Null for the web: the refresh token travels in an HttpOnly cookie. */
  refreshToken: string | null
  tokenType: 'Bearer'
  expiresIn: number
  user: AuthUser
}

export interface MeResponse extends AuthUser { lastLoginAt: string | null }
export interface LoginRequest { email: string; password: string; deviceInfo?: string }
export interface RegisterRestaurantRequest {
  restaurantCode: string; restaurantName: string; legalName?: string; phone?: string; address?: string
  timezone: string; currencyCode: string; ownerName: string; ownerEmail: string; ownerPhone?: string; password: string
}

export interface ApiErrorResponse {
  success: false; code: string; message: string; fieldErrors: Record<string, string>; timestamp: string
}

export interface NormalizedApiError {
  status?: number; code: string; message: string; fieldErrors: Record<string, string>; isNetworkError: boolean
}

export interface CurrentEntitlement { subscriptionId: string; packageCode: string; status: string; startAt: string; endAt: string; features: FeatureEntitlement[]; /** Staff seat limit of the active subscription; null or absent means unlimited. */ maxStaff?: number | null; packageName?: string | null }
export type EntitlementState = 'idle' | 'loading' | 'active' | 'inactive' | 'error'

export type { FeatureEntitlement, FeatureResponse, AdminPackageResponse as PackageResponse, SubscriptionResponse, SubscriptionStatus } from './admin'
export interface PageResponse<T> { content: T[]; page: number; size: number; totalElements: number; totalPages: number }
