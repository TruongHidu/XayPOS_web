import { describe, expect, it } from 'vitest'
import { defaultRouteForUser, postLoginRoute, safeReturnUrl } from '../shared/utils/routing'
import { adminUser, ownerUser } from './server'
import { normalizeApiError } from '../shared/errors/normalizeApiError'

describe('routing and error contract', () => {
  it.each([
    ['SUPER_ADMIN', null, '/admin/dashboard'], ['OWNER', 'r1', '/cashier/dashboard'], ['MANAGER', 'r1', '/cashier/dashboard'],
    ['CASHIER', 'r1', '/cashier/pos'], ['WAITER', 'r1', '/cashier/orders'], ['KITCHEN', 'r1', '/cashier/kitchen'], ['SUPER_ADMIN', 'r1', '/forbidden'],
  ])('maps %s with tenant %s to %s', (role, restaurantId, expected) => expect(defaultRouteForUser({ role: role as never, restaurantId })).toBe(expected))

  it('rejects external return urls', () => { expect(safeReturnUrl('https://evil.example/steal')).toBeNull(); expect(safeReturnUrl('//evil.example')).toBeNull(); expect(safeReturnUrl('/cashier/dashboard')).toBe('/cashier/dashboard') })
  it('does not reuse a return URL from another account portal', () => {
    expect(postLoginRoute(adminUser, '/cashier/dashboard')).toBe('/admin/dashboard')
    expect(postLoginRoute(ownerUser, '/admin/dashboard')).toBe('/cashier/dashboard')
    expect(postLoginRoute(adminUser, '/admin/restaurants?q=demo')).toBe('/admin/restaurants?q=demo')
  })
  it('normalizes business and network errors without leaking internals', () => {
    expect(normalizeApiError(new Error('secret stack')).message).toBe('Đã xảy ra lỗi. Vui lòng thử lại.')
  })
})
