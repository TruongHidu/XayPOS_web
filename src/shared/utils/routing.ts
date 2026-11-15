import type { AuthUser } from '../types/auth'

export const TENANT_HOME = '/app/home'

const isPortalPath = (path: string, base: string) => path === base || path.startsWith(base + '/')

export const isInternalPath = (value: string | null | undefined): value is string => Boolean(value && value.startsWith('/') && !value.startsWith('//'))

export function safeReturnUrl(value: string | null | undefined): string | null {
  if (!isInternalPath(value)) return null
  try { return new URL(value, window.location.origin).origin === window.location.origin ? value : null } catch { return null }
}

export function defaultRouteForUser(user: Pick<AuthUser, 'role' | 'restaurantId'>): string {
  if (user.role === 'SUPER_ADMIN' && user.restaurantId === null) return '/admin/dashboard'
  // Every restaurant role lands on the portal home, which opens the first section the
  // user's permissions and package allow (see portals/app/sections.tsx).
  if (user.role !== 'SUPER_ADMIN' && user.restaurantId !== null) return TENANT_HOME
  return '/forbidden'
}

export function postLoginRoute(user: Pick<AuthUser, 'role' | 'restaurantId'>, requested: string | null | undefined): string {
  const returnUrl = safeReturnUrl(requested)
  if (!returnUrl) return defaultRouteForUser(user)
  const path = new URL(returnUrl, window.location.origin).pathname
  const isSystemAdminPath = user.role === 'SUPER_ADMIN' && user.restaurantId === null && (path === '/admin' || path.startsWith('/admin/'))
  const isTenantPath = user.role !== 'SUPER_ADMIN' && user.restaurantId !== null && (isPortalPath(path, '/app') || isPortalPath(path, '/cashier'))
  const isOnboardingPath = user.role === 'OWNER' && user.restaurantId !== null && (path === '/onboarding' || path.startsWith('/onboarding/'))
  return isSystemAdminPath || isTenantPath || isOnboardingPath ? returnUrl : defaultRouteForUser(user)
}
