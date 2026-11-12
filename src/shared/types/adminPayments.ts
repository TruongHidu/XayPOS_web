// Super admin: package purchases, bank-transfer review queue, revenue and restaurant support.

export type PurchaseStatus = 'PENDING_PAYMENT' | 'PAID' | 'ACTIVATED' | 'EXPIRED' | 'CANCELLED' | 'REVIEW_REQUIRED' | 'CLOSED'
export type PaymentEventState = 'RECEIVED' | 'PROCESSING' | 'RETRY_PENDING' | 'PROCESSED' | 'REVIEW_REQUIRED' | 'CLOSED'
export type PaymentReviewReason =
  | 'AMOUNT_MISMATCH'
  | 'REFERENCE_UNMATCHED'
  | 'REFERENCE_AMBIGUOUS'
  | 'ACCOUNT_MISMATCH'
  | 'OUTGOING_TRANSFER'
  | 'DUPLICATE_PAYMENT'
  | 'PURCHASE_CANCELLED'
  | 'PAYMENT_OUTSIDE_WINDOW'
  | 'SUBSCRIPTION_CONFLICT'
  | 'RESTAURANT_UNAVAILABLE'
  | 'IDENTITY_UNCERTAIN'
  | 'IDENTITY_CONFLICT'
  | 'TECHNICAL_RETRY_EXHAUSTED'

export interface RestaurantRef {
  id: string
  code: string
  name: string
  status: string
}

export interface PurchaseSummary {
  id: string
  restaurant: RestaurantRef
  packageCode: string
  packageName: string
  amount: number
  currencyCode: string
  status: PurchaseStatus
  reviewReason: PaymentReviewReason | null
  createdAt: string
  expiresAt: string
  paidAt: string | null
  activatedAt: string | null
  closedAt: string | null
  cancelledAt: string | null
  subscriptionId: string | null
  activationErrorCode: string | null
}

export interface PaymentAttemptView {
  id: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'CANCELLED'
  referenceCode: string
  amount: number
  createdAt: string
  expiresAt: string
  paidAt: string | null
  failureCode: string | null
}

export interface PaymentEventSummary {
  id: string
  state: PaymentEventState
  reviewReason: PaymentReviewReason | null
  direction: 'in' | 'out'
  amount: number
  currencyCode: string
  occurredAt: string
  receivedAt: string
  paymentReference: string | null
  transferContent: string | null
  bankReference: string | null
  receiverAccount: string
  receiverBank: string
  source: string
  deliveryCount: number
  restaurant: RestaurantRef | null
  purchaseId: string | null
  purchaseStatus: PurchaseStatus | null
  purchaseAmount: number | null
  reviewedAt: string | null
  reviewerName: string | null
  reviewNote: string | null
  resolutionReference: string | null
  lastErrorCode: string | null
}

export interface PurchaseDetail {
  purchase: PurchaseSummary
  createdByName: string | null
  createdByEmail: string | null
  cancelReason: string | null
  activationRetryCount: number
  attempts: PaymentAttemptView[]
  events: PaymentEventSummary[]
}

export interface PaymentReviewCounts {
  paymentEvents: number
  purchases: number
  paidAwaitingActivation: number
}

export interface PurchaseCriteria {
  status: PurchaseStatus | ''
  restaurantId: string
  q: string
  page: number
  size: number
}

export interface PaymentEventCriteria {
  state: PaymentEventState | ''
  reviewReason: PaymentReviewReason | ''
  q: string
  page: number
  size: number
}

export interface AdminRevenue {
  generatedAt: string
  currencyCode: string
  zoneId: string
  mrr: number
  payingRestaurants: number
  revenueThisMonth: number
  revenuePreviousMonth: number
  churnedLast30Days: number
  series: Array<{
    month: string
    revenue: number
    onlineRevenue: number
    manualRevenue: number
    activatedSubscriptions: number
    newRestaurants: number
  }>
  packageMix: Array<{ packageCode: string; packageName: string; restaurants: number; mrr: number }>
  expiringSoon: Array<{
    restaurantId: string
    restaurantCode: string
    restaurantName: string
    packageCode: string
    endAt: string
    renewalPending: boolean
  }>
}

export interface RestaurantUsage {
  packageCode: string | null
  subscriptionEndAt: string | null
  maxStaff: number | null
  activeStaff: number
  totalUsers: number
  activeTables: number
  activeMenuItems: number
  ordersLast30Days: number
  salesLast30Days: number
  lastOrderAt: string | null
  lastLoginAt: string | null
  features: string[]
}

export interface RestaurantNote {
  id: string
  content: string
  authorId: string
  authorName: string | null
  createdAt: string
}

export interface TemporaryPasswordResponse {
  temporaryPassword: string
  revokedSessions: number
}
