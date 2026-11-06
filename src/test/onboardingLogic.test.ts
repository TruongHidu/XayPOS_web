import { afterEach, describe, expect, it } from 'vitest'
import { generateRestaurantCode } from '../features/auth/utils/restaurantCode'
import { formatCountdown, remainingMs } from '../features/onboarding/hooks/useServerCountdown'
import type { CatalogPackage, OnboardingStatus } from '../features/onboarding/schemas'
import { buildPackageCards, featureLabels, staffLimitLabel } from '../features/onboarding/utils/packagePresentation'
import { clearPurchaseIntent, purchaseIntentFor } from '../features/onboarding/utils/purchaseIntent'
import { resolveOnboardingView } from '../features/onboarding/utils/resolveOnboardingView'
import { purchaseFixture } from './onboardingFixtures'

const status = (overrides: Partial<OnboardingStatus> = {}): OnboardingStatus => ({
  subscriptionState: 'NONE',
  currentSubscription: null,
  currentPurchase: null,
  unresolvedPaymentReviewCount: 0,
  canPurchase: false,
  blockedReason: null,
  allowedActions: [],
  serverTime: '2026-11-01T03:00:00Z',
  ...overrides,
})

const plan = (code: string, priceAmount: number, features: string[]): CatalogPackage => ({
  id: code,
  code,
  name: code,
  description: null,
  priceAmount,
  currencyCode: 'VND',
  billingCycleMonths: 1,
  maxStaff: null,
  features: features.map((feature) => ({ code: feature, limits: {} })),
})

describe('resolveOnboardingView', () => {
  it('offers packages when purchasing is allowed', () => {
    expect(resolveOnboardingView(status({ canPurchase: true }))).toEqual({ kind: 'select', expiredPurchase: false })
  })

  it('marks an expired open purchase but still offers packages', () => {
    const currentPurchase = purchaseFixture({ displayStatus: 'EXPIRED' })
    expect(resolveOnboardingView(status({ canPurchase: true, currentPurchase }))).toEqual({ kind: 'select', expiredPurchase: true })
  })

  it.each(['PURCHASE_IN_PROGRESS', 'PURCHASE_REVIEW_REQUIRED'])('opens the current purchase for %s', (blockedReason) => {
    const currentPurchase = purchaseFixture()
    expect(resolveOnboardingView(status({ blockedReason, currentPurchase }))).toEqual({ kind: 'open-purchase', purchaseId: currentPurchase.id })
  })

  it('does not let accept-new=false hide an active subscription', () => {
    const view = resolveOnboardingView(status({ subscriptionState: 'ACTIVE', blockedReason: 'PURCHASE_UNAVAILABLE', allowedActions: ['OPEN_APP'] }))
    expect(view).toEqual({ kind: 'active', hasPaymentReview: false })
  })

  it('does not let accept-new=false hide an open purchase', () => {
    const currentPurchase = purchaseFixture()
    expect(resolveOnboardingView(status({ blockedReason: 'PURCHASE_UNAVAILABLE', currentPurchase })).kind).toBe('open-purchase')
  })

  it('shows packages read-only when new purchases are off', () => {
    expect(resolveOnboardingView(status({ blockedReason: 'PURCHASE_UNAVAILABLE' }))).toEqual({ kind: 'unavailable', expiredPurchase: false })
  })

  it('maps the remaining blocked states', () => {
    expect(resolveOnboardingView(status({ blockedReason: 'PURCHASE_PERMISSION_REQUIRED' })).kind).toBe('refresh-permission')
    expect(resolveOnboardingView(status({ subscriptionState: 'PENDING', blockedReason: 'SUBSCRIPTION_PENDING_EXISTS' })).kind).toBe('pending-subscription')
    expect(resolveOnboardingView(status({ blockedReason: 'SOMETHING_NEW' })).kind).toBe('blocked')
  })

  it('flags a payment review next to an active subscription', () => {
    expect(resolveOnboardingView(status({ subscriptionState: 'ACTIVE', unresolvedPaymentReviewCount: 2 }))).toEqual({ kind: 'active', hasPaymentReview: true })
  })
})

describe('purchaseIntent', () => {
  const scope = { restaurantId: 'restaurant-1', userId: 'owner-1' }
  afterEach(() => sessionStorage.clear())

  it('keeps the key for a retry of the same package', () => {
    const first = purchaseIntentFor(scope, 'PRO')
    expect(first.key).toMatch(/^purchase-[A-Za-z0-9._:-]{8,91}$/)
    expect(purchaseIntentFor(scope, 'PRO').key).toBe(first.key)
  })

  it('uses a new key for a different package or after clearing', () => {
    const first = purchaseIntentFor(scope, 'PRO')
    const changed = purchaseIntentFor(scope, 'BASIC')
    expect(changed.key).not.toBe(first.key)
    clearPurchaseIntent(scope)
    expect(purchaseIntentFor(scope, 'BASIC').key).not.toBe(changed.key)
  })

  it('isolates intents per user', () => {
    const first = purchaseIntentFor(scope, 'PRO')
    expect(purchaseIntentFor({ ...scope, userId: 'owner-2' }, 'PRO').key).not.toBe(first.key)
  })
})

describe('package presentation', () => {
  it('lists only what a plan adds when it contains the cheaper plan', () => {
    const [basic, pro] = buildPackageCards([plan('PRO', 399000, ['MENU_MANAGEMENT', 'STOCK_AUDIT']), plan('BASIC', 199000, ['MENU_MANAGEMENT'])])
    expect(basic.plan.code).toBe('BASIC')
    expect(pro.includesPlanName).toBe('BASIC')
    expect(pro.items).toEqual(['Kiểm kê kho'])
  })

  it('does not claim a plan includes one it does not fully contain', () => {
    const [, other] = buildPackageCards([plan('A', 1, ['MENU_MANAGEMENT']), plan('B', 2, ['STOCK_AUDIT'])])
    expect(other.includesPlanName).toBeNull()
    expect(other.items).toEqual(['Kiểm kê kho'])
  })

  it('caps the visible rows and drops unknown feature codes', () => {
    const codes = ['MENU_MANAGEMENT', 'ORDER_MANAGEMENT', 'TABLE_MANAGEMENT', 'RECEIPT_PRINT', 'DAILY_REVENUE', 'STAFF_MANAGEMENT', 'STOCK_AUDIT', 'FUTURE_CODE']
    const [card] = buildPackageCards([plan('A', 1, codes)])
    expect(card.items).toHaveLength(6)
    expect(card.hiddenCount).toBe(1)
    expect(featureLabels([{ code: 'FUTURE_CODE' }])).toEqual([])
  })

  it('keeps null maxStaff as unlimited, not zero', () => {
    expect(staffLimitLabel(null)).toBe('Không giới hạn nhân viên')
    expect(staffLimitLabel(30)).toBe('Tối đa 30 nhân viên')
  })
})

describe('countdown', () => {
  it('measures from the server clock', () => {
    expect(remainingMs('2026-11-01T03:15:00Z', '2026-11-01T03:00:00Z')).toBe(900_000)
  })
  it('formats and never goes negative', () => {
    expect(formatCountdown(900_000)).toBe('15:00')
    expect(formatCountdown(61_500)).toBe('01:02')
    expect(formatCountdown(-1)).toBe('00:00')
  })
})

describe('generateRestaurantCode', () => {
  it('strips Vietnamese diacritics and stays within the backend limit', () => {
    expect(generateRestaurantCode('Quán Đồng Quê 1')).toMatch(/^QUAN_DONG_QUE_1_[A-Z2-9]{6}$/)
    expect(generateRestaurantCode('x'.repeat(150)).length).toBeLessThanOrEqual(50)
  })
  it('falls back when the name has no usable characters', () => {
    expect(generateRestaurantCode('!!!')).toMatch(/^NHAHANG_[A-Z2-9]{6}$/)
  })
  it('never repeats a code for the same name', () => {
    expect(generateRestaurantCode('Demo')).not.toBe(generateRestaurantCode('Demo'))
  })
})
