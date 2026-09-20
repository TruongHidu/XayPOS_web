import type { AuthUser } from '../types/auth'

export const isInternalPath = (value: string | null | undefined): value is string => Boolean(value && value.startsWith('/') && !value.startsWith('//'))

export function safeReturnUrl(value: string | null | undefined): string | null {
  if (!isInternalPath(value)) return null
  try { return new URL(value, window.location.origin).origin === window.location.origin ? value : null } catch { return null }
}

export function defaultRouteForUser(user: Pick<AuthUser, 'role' | 'restaurantId'>): string {
  if (user.role === 'SUPER_ADMIN' && user.restaurantId === null) return '/admin/dashboard'
  if (user.role === 'OWNER' && user.restaurantId !== null) return '/cashier/dashboard'
  if (user.role === 'MANAGER' && user.restaurantId !== null) return '/cashier/dashboard'
  if (user.role === 'CASHIER' && user.restaurantId !== null) return '/cashier/pos'
  if (user.role === 'WAITER' && user.restaurantId !== null) return '/cashier/orders'
  if (user.role === 'KITCHEN' && user.restaurantId !== null) return '/cashier/kitchen'
  return '/forbidden'
}

export function postLoginRoute(user: Pick<AuthUser, 'role' | 'restaurantId'>, requested: string | null | undefined): string {
  const returnUrl = safeReturnUrl(requested)
  if (!returnUrl) return defaultRouteForUser(user)
  const path = new URL(returnUrl, window.location.origin).pathname
  const isSystemAdminPath = user.role === 'SUPER_ADMIN' && user.restaurantId === null && (path === '/admin' || path.startsWith('/admin/'))
  const isTenantPath = user.role !== 'SUPER_ADMIN' && user.restaurantId !== null && (path === '/cashier' || path.startsWith('/cashier/'))
  return isSystemAdminPath || isTenantPath ? returnUrl : defaultRouteForUser(user)
}
