import type { AuthUser, CurrentEntitlement } from '../types/auth'

export const channels = {
  orders: '/user/queue/orders',
  qr: '/user/queue/qr-order-requests',
  kitchen: '/user/queue/kitchen-orders',
  inventory: '/user/queue/inventory-alerts',
} as const
export type Channel = keyof typeof channels
export function allowedChannels(
  access: { user: AuthUser | null; entitlement: CurrentEntitlement | null; entitlementState: string },
  consumers: Partial<Record<Channel, boolean>>,
): Channel[] {
  const { user, entitlement } = access
  if (
    !user?.restaurantId ||
    user.role === 'SUPER_ADMIN' ||
    access.entitlementState !== 'active' ||
    entitlement?.status !== 'ACTIVE'
  )
    return []
  const has = (permission: string, ...features: string[]) =>
    user.permissions.includes(permission) && features.every((code) => entitlement.features.some((f) => f.code === code))
  return (Object.keys(channels) as Channel[]).filter((channel) => {
    if (!consumers[channel]) return false
    if (channel === 'orders' || channel === 'qr') return has('ORDER_VIEW', 'ORDER_MANAGEMENT')
    if (channel === 'kitchen') return has('KITCHEN_VIEW', 'KITCHEN_DISPLAY')
    return (
      ['OWNER', 'MANAGER', 'WAITER', 'KITCHEN'].includes(user.role) &&
      has('INVENTORY_VIEW', 'INVENTORY_MANAGEMENT', 'LOW_STOCK_ALERT')
    )
  })
}
