import type { AuditLogCriteria, RestaurantListCriteria, RestaurantSubscriptionCriteria, SubscriptionListCriteria } from '../../../shared/types/admin'

export const adminKeys = {
  all: ['admin'] as const,
  dashboard: { all: ['admin', 'dashboard'] as const, summary: () => ['admin', 'dashboard', 'summary'] as const },
  features: (includeInactive: boolean) => ['admin', 'features', { includeInactive }] as const,
  featureDetail: (featureCode: string) => ['admin', 'features', featureCode] as const,
  packages: (includeInactive: boolean) => ['admin', 'packages', { includeInactive }] as const,
  packageDetail: (packageCode: string) => ['admin', 'packages', packageCode] as const,
  restaurants: (criteria: RestaurantListCriteria) => ['admin', 'restaurants', criteria] as const,
  restaurant: (restaurantId: string) => ['admin', 'restaurants', restaurantId] as const,
  subscriptions: (criteria: SubscriptionListCriteria) => ['admin', 'subscriptions', criteria] as const,
  restaurantSubscriptions: (restaurantId: string, criteria: RestaurantSubscriptionCriteria) => ['admin', 'restaurants', restaurantId, 'subscriptions', criteria] as const,
  subscription: (restaurantId: string, subscriptionId: string) => ['admin', 'restaurants', restaurantId, 'subscriptions', subscriptionId] as const,
  audit: (criteria: AuditLogCriteria) => ['admin', 'audit-logs', criteria] as const,
}
