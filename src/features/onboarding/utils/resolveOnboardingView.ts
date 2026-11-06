import type { OnboardingStatus } from '../schemas'

export type OnboardingView =
  | { kind: 'active'; hasPaymentReview: boolean }
  | { kind: 'pending-subscription' }
  | { kind: 'open-purchase'; purchaseId: string }
  | { kind: 'select'; expiredPurchase: boolean }
  | { kind: 'unavailable'; expiredPurchase: boolean }
  | { kind: 'refresh-permission' }
  | { kind: 'blocked' }

/**
 * blockedReason ranks PURCHASE_UNAVAILABLE first, so it alone cannot be trusted:
 * with accept-new off, active restaurants and open purchases still need their own screens.
 */
export function resolveOnboardingView(status: OnboardingStatus): OnboardingView {
  if (status.subscriptionState === 'ACTIVE' || status.allowedActions.includes('OPEN_APP'))
    return { kind: 'active', hasPaymentReview: status.unresolvedPaymentReviewCount > 0 }
  if (status.subscriptionState === 'PENDING') return { kind: 'pending-subscription' }

  const purchase = status.currentPurchase
  const expiredPurchase = purchase?.displayStatus === 'EXPIRED'
  if (purchase && !expiredPurchase) return { kind: 'open-purchase', purchaseId: purchase.id }

  if (status.canPurchase) return { kind: 'select', expiredPurchase }
  if (status.blockedReason === 'PURCHASE_UNAVAILABLE') return { kind: 'unavailable', expiredPurchase }
  if (status.blockedReason === 'PURCHASE_PERMISSION_REQUIRED') return { kind: 'refresh-permission' }
  return { kind: 'blocked' }
}
