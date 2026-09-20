export interface FeatureResponse {
  id: string
  code: string
  name: string
  description: string | null
  active: boolean
}

export interface FeatureEntitlement {
  code: string
  limits: Record<string, unknown>
}

export interface AdminPackageResponse {
  id: string
  code: string
  name: string
  description: string | null
  priceAmount: number
  currencyCode: string
  billingCycleMonths: number
  active: boolean
  features: FeatureEntitlement[]
}

export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED'
export type PackageAssignmentState = 'AVAILABLE' | 'PENDING' | 'ACTIVE'

export type RestaurantStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
export type AdminSortDirection = 'asc' | 'desc'

export interface AdminSubscriptionBriefResponse {
  id: string
  packageCode: string
  status: SubscriptionStatus
  startAt: string
  endAt: string
  autoRenew: boolean
}

export interface RestaurantResponse {
  id: string
  code: string
  name: string
  legalName: string | null
  phone: string | null
  timezone: string
  currencyCode: string
  status: RestaurantStatus
  createdAt: string
  updatedAt: string
  effectiveSubscription: AdminSubscriptionBriefResponse | null
  packageAssignmentState: PackageAssignmentState
}

export interface RestaurantOwner { id: string; name: string; email: string; phone: string | null; active: boolean }
export interface RestaurantDetailResponse extends RestaurantResponse {
  owners: RestaurantOwner[]
  totalUsers: number
  activeUsers: number
  latestSubscription: AdminSubscriptionBriefResponse | null
}

export interface RestaurantListCriteria {
  q: string
  status: RestaurantStatus | ''
  page: number
  size: number
  sortBy: 'createdAt' | 'updatedAt' | 'code' | 'name' | 'status'
  direction: AdminSortDirection
}

export interface UpdateRestaurantStatusRequest { status: RestaurantStatus; reason: string }

export interface DashboardSummary {
  generatedAt: string
  restaurants: { total: number; active: number; inactive: number; suspended: number; newLast30Days: number; activeWithoutEffectiveSubscription: number }
  subscriptions: { total: number; pending: number; activeStatus: number; effectiveNow: number; staleActive: number; expired: number; cancelled: number; expiringWithin7Days: number }
  packages: { total: number; active: number; inactive: number }
  features: { total: number; active: number; inactive: number }
}

export interface AdminSubscriptionSummary extends SubscriptionResponse {
  restaurantCode: string
  restaurantName: string
  restaurantStatus: RestaurantStatus
  packageName: string | null
  effective: boolean
  createdAt: string
}

export interface SubscriptionListCriteria {
  q: string
  restaurantId: string
  packageCode: string
  status: SubscriptionStatus | ''
  effective: '' | 'true' | 'false'
  page: number
  size: number
  sortBy: 'createdAt' | 'startAt' | 'endAt' | 'status' | 'priceAmount'
  direction: AdminSortDirection
}

export interface RestaurantSubscriptionCriteria { status: SubscriptionStatus | ''; packageCode: string; page: number; size: number }

export type AuditScope = 'ALL' | 'SYSTEM' | 'TENANT'
export interface AuditLogResponse {
  id: string
  createdAt: string
  scope: AuditScope
  restaurantId: string | null
  restaurantCode: string | null
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  actionCode: string
  entityType: string
  entityId: string | null
  ip: string | null
  beforeData: unknown
  afterData: unknown
}

export interface AuditLogCriteria {
  scope: AuditScope
  restaurantId: string
  actorUserId: string
  actionCode: string
  entityType: string
  entityId: string
  from: string
  to: string
  page: number
  size: number
}

export interface SubscriptionResponse {
  id: string
  restaurantId: string
  packageId: string
  packageCode: string
  status: SubscriptionStatus
  startAt: string
  endAt: string
  autoRenew: boolean
  priceAmount: number
  currencyCode: string
  activatedAt: string | null
  cancelledAt: string | null
  features: FeatureEntitlement[]
}

export interface CreateFeatureRequest { code: string; name: string; description?: string | null }
export interface UpdateFeatureRequest { name: string; description?: string | null; active: boolean }
export interface CreatePackageRequest { code: string; name: string; description?: string | null; priceAmount: number; currencyCode: string; billingCycleMonths: number }
export interface UpdatePackageRequest { name: string; description?: string | null; priceAmount: number; currencyCode: string; billingCycleMonths: number; active: boolean }
export interface PackageFeatureRequest { limits: Record<string, unknown> }
export interface CreateSubscriptionRequest { packageCode: string; startAt: string; endAt: string; autoRenew: boolean; priceAmount: number; currencyCode: string }
export interface ChangePackageRequest { packageCode: string; endAt: string; autoRenew: boolean; priceAmount: number; currencyCode: string }
