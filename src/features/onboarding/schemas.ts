import { z } from 'zod'

const featureGrantSchema = z.object({ code: z.string(), limits: z.record(z.string(), z.unknown()) })

export const catalogPackageSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  priceAmount: z.number(),
  currencyCode: z.string(),
  billingCycleMonths: z.number(),
  features: z.array(featureGrantSchema),
  maxStaff: z.number().nullable(),
})
export type CatalogPackage = z.infer<typeof catalogPackageSchema>

export const purchaseStatusSchema = z.enum([
  'PENDING_PAYMENT',
  'PAID',
  'ACTIVATED',
  'EXPIRED',
  'CANCELLED',
  'REVIEW_REQUIRED',
  'CLOSED',
])
export type PurchaseStatus = z.infer<typeof purchaseStatusSchema>

export const purchaseQuoteSchema = z.object({
  schemaVersion: z.number(),
  packageId: z.string(),
  packageCode: z.string(),
  packageName: z.string(),
  priceAmount: z.number(),
  currencyCode: z.string(),
  billingCycleMonths: z.number(),
  features: z.array(featureGrantSchema),
  maxStaff: z.number().nullable(),
  quotedAt: z.string(),
  expiresAt: z.string(),
  billingZoneId: z.string(),
})
export type PurchaseQuote = z.infer<typeof purchaseQuoteSchema>

export const purchaseViewSchema = z.object({
  id: z.string(),
  status: purchaseStatusSchema,
  displayStatus: purchaseStatusSchema,
  quote: purchaseQuoteSchema,
  subscriptionId: z.string().nullable(),
  paidAt: z.string().nullable(),
  activatedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  reviewReason: z.string().nullable(),
  allowedActions: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number(),
  serverTime: z.string(),
})
export type PurchaseView = z.infer<typeof purchaseViewSchema>

export const attemptStatusSchema = z.enum(['PENDING', 'SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED'])
export type AttemptStatus = z.infer<typeof attemptStatusSchema>

export const paymentAttemptSchema = z.object({
  id: z.string(),
  purchaseId: z.string(),
  status: attemptStatusSchema,
  displayStatus: attemptStatusSchema,
  provider: z.string(),
  referenceCode: z.string(),
  amount: z.number(),
  currencyCode: z.string(),
  expiresAt: z.string(),
  instructions: z.object({
    bankCode: z.string().nullable(),
    accountNumber: z.string().nullable(),
    accountName: z.string().nullable(),
    transferContent: z.string(),
    qrPayload: z.string().nullable(),
    qrImageUrl: z.string().nullable(),
  }),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number(),
  serverTime: z.string(),
})
export type PaymentAttempt = z.infer<typeof paymentAttemptSchema>

export const currentAttemptSchema = z.object({ paymentAttempt: paymentAttemptSchema.nullable(), serverTime: z.string() })
export type CurrentAttempt = z.infer<typeof currentAttemptSchema>

export const onboardingStatusSchema = z.object({
  subscriptionState: z.enum(['NONE', 'PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED']),
  currentSubscription: z
    .object({
      id: z.string(),
      status: z.string(),
      effective: z.boolean(),
      packageCode: z.string(),
      startAt: z.string().nullable(),
      endAt: z.string().nullable(),
      activatedAt: z.string().nullable(),
    })
    .nullable(),
  currentPurchase: purchaseViewSchema.nullable(),
  unresolvedPaymentReviewCount: z.number(),
  canPurchase: z.boolean(),
  blockedReason: z.string().nullable(),
  allowedActions: z.array(z.string()),
  serverTime: z.string(),
})
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>

export const purchasePageSchema = z.object({
  content: z.array(purchaseViewSchema),
  page: z.number(),
  size: z.number(),
  totalElements: z.number(),
  totalPages: z.number(),
})
export type PurchasePage = z.infer<typeof purchasePageSchema>

export const restaurantProfileSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  legalName: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  timezone: z.string(),
  currencyCode: z.string(),
  status: z.string(),
})
export type RestaurantProfile = z.infer<typeof restaurantProfileSchema>

export const restaurantFormSchema = z.object({
  name: z.string().trim().min(1, 'Tên nhà hàng là bắt buộc.').max(150, 'Tên nhà hàng không được vượt quá 150 ký tự.'),
  phone: z.string().trim().max(30, 'Số điện thoại không được vượt quá 30 ký tự.'),
  address: z.string().trim().max(500, 'Địa chỉ không được vượt quá 500 ký tự.'),
})
export type RestaurantFormValues = z.infer<typeof restaurantFormSchema>
