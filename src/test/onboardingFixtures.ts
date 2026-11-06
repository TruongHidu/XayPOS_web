import { HttpResponse } from 'msw'
import type { CatalogPackage, OnboardingStatus, PaymentAttempt, PurchaseView, RestaurantProfile } from '../features/onboarding/schemas'
import type { AuthUser } from '../shared/types/auth'

export const API = 'http://localhost:8080/api/v1'

export const onboardingOwner: AuthUser = {
  id: 'owner-1',
  restaurantId: 'restaurant-1',
  restaurantCode: 'DEMO01',
  restaurantName: 'Demo Restaurant',
  name: 'Owner',
  email: 'owner@example.com',
  phone: null,
  role: 'OWNER',
  permissions: ['SUBSCRIPTION_PURCHASE_VIEW', 'SUBSCRIPTION_PURCHASE_CREATE', 'SUBSCRIPTION_PURCHASE_CANCEL'],
}

export const catalog: CatalogPackage[] = [
  {
    id: 'package-basic',
    code: 'BASIC',
    name: 'Basic',
    description: 'Cho quán nhỏ',
    priceAmount: 199000,
    currencyCode: 'VND',
    billingCycleMonths: 1,
    maxStaff: 5,
    features: [{ code: 'MENU_MANAGEMENT', limits: {} }],
  },
  {
    id: 'package-pro',
    code: 'PRO',
    name: 'Pro',
    description: null,
    priceAmount: 399000,
    currencyCode: 'VND',
    billingCycleMonths: 1,
    maxStaff: null,
    features: [
      { code: 'MENU_MANAGEMENT', limits: {} },
      { code: 'RECIPE_MANAGEMENT', limits: {} },
    ],
  },
]

export const purchaseFixture = (overrides: Partial<PurchaseView> = {}): PurchaseView => ({
  id: '11111111-1111-4111-8111-111111111111',
  status: 'PENDING_PAYMENT',
  displayStatus: 'PENDING_PAYMENT',
  quote: {
    schemaVersion: 1,
    packageId: 'package-pro',
    packageCode: 'PRO',
    packageName: 'Pro',
    priceAmount: 399000,
    currencyCode: 'VND',
    billingCycleMonths: 1,
    features: [{ code: 'RECIPE_MANAGEMENT', limits: {} }],
    maxStaff: 30,
    quotedAt: '2026-11-01T03:00:00Z',
    expiresAt: '2026-11-01T03:15:00Z',
    billingZoneId: 'Asia/Ho_Chi_Minh',
  },
  subscriptionId: null,
  paidAt: null,
  activatedAt: null,
  cancelledAt: null,
  closedAt: null,
  reviewReason: null,
  allowedActions: ['VIEW_PURCHASE', 'CANCEL_PURCHASE'],
  createdAt: '2026-11-01T03:00:00Z',
  updatedAt: '2026-11-01T03:00:00Z',
  version: 0,
  serverTime: '2026-11-01T03:00:00Z',
  ...overrides,
})

export const attemptFixture = (overrides: Partial<PaymentAttempt> = {}): PaymentAttempt => ({
  id: '22222222-2222-4222-8222-222222222222',
  purchaseId: '11111111-1111-4111-8111-111111111111',
  status: 'PENDING',
  displayStatus: 'PENDING',
  provider: 'SEPAY',
  referenceCode: 'PS0123456789ABCDEF0123',
  amount: 399000,
  currencyCode: 'VND',
  expiresAt: '2026-11-01T03:15:00Z',
  instructions: {
    bankCode: 'MBBank',
    accountNumber: '0123456789',
    accountName: 'POS SAAS DEMO',
    transferContent: 'PS0123456789ABCDEF0123',
    qrPayload: '00020101021238540010A00000072701240006970422011001234567890208QRIBFTTA53037045406399000',
    qrImageUrl: 'https://qr.sepay.vn/img?acc=0123456789&bank=MBBank&amount=399000&des=PS0123456789ABCDEF0123',
  },
  paidAt: null,
  createdAt: '2026-11-01T03:01:00Z',
  updatedAt: '2026-11-01T03:01:00Z',
  version: 0,
  serverTime: '2026-11-01T03:01:00Z',
  ...overrides,
})

export const onboardingStatus = (overrides: Partial<OnboardingStatus> = {}): OnboardingStatus => ({
  subscriptionState: 'NONE',
  currentSubscription: null,
  currentPurchase: null,
  unresolvedPaymentReviewCount: 0,
  canPurchase: true,
  blockedReason: null,
  allowedActions: ['CREATE_PURCHASE'],
  serverTime: '2026-11-01T03:00:00Z',
  ...overrides,
})

export const restaurantProfile = (overrides: Partial<RestaurantProfile> = {}): RestaurantProfile => ({
  id: 'restaurant-1',
  code: 'DEMO01',
  name: 'Demo Restaurant',
  legalName: null,
  phone: null,
  address: null,
  timezone: 'Asia/Ho_Chi_Minh',
  currencyCode: 'VND',
  status: 'ACTIVE',
  ...overrides,
})

export const apiError = (status: number, code: string) =>
  HttpResponse.json({ success: false, code, message: code, fieldErrors: {}, timestamp: '2026-11-01T03:00:00Z' }, { status })
