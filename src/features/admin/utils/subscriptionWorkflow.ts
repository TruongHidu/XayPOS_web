import type { QueryClient } from '@tanstack/react-query'
import type { AuthUser } from '../../../shared/types/auth'
import type { AdminSubscriptionBriefResponse, PackageAssignmentState } from '../../../shared/types/admin'
import { adminKeys } from '../api/adminKeys'

export type RestaurantSubscriptionAction =
  'ASSIGN' | 'ACTIVATE_PENDING' | 'CANCEL_PENDING' | 'CHANGE_PACKAGE' | 'CANCEL_ACTIVE' | 'VIEW_SUBSCRIPTIONS'

export function getSubscriptionActions(
  state: PackageAssignmentState,
  effectiveSubscription: AdminSubscriptionBriefResponse | null,
): RestaurantSubscriptionAction[] {
  if (state === 'AVAILABLE') return ['ASSIGN']
  if (state === 'PENDING') return ['ACTIVATE_PENDING', 'CANCEL_PENDING']
  if (state === 'ACTIVE' && effectiveSubscription) return ['CHANGE_PACKAGE', 'CANCEL_ACTIVE']
  if (state === 'ACTIVE') return ['VIEW_SUBSCRIPTIONS', 'CANCEL_ACTIVE']
  return []
}

export function canManageRestaurantSubscriptions(user: AuthUser | null): boolean {
  return Boolean(
    user?.role === 'SUPER_ADMIN' && user.restaurantId === null && user.permissions.includes('SUBSCRIPTION_MANAGE'),
  )
}

export async function invalidateSubscriptionWorkflow(queryClient: QueryClient, restaurantId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['admin', 'restaurants'] }),
    queryClient.invalidateQueries({ queryKey: adminKeys.restaurant(restaurantId) }),
    queryClient.invalidateQueries({ queryKey: ['admin', 'restaurants', restaurantId, 'subscriptions'] }),
    queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }),
    queryClient.invalidateQueries({ queryKey: adminKeys.dashboard.all }),
  ])
}
