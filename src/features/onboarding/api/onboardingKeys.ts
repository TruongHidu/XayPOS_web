export const onboardingKeys = {
  packages: ['public', 'packages'] as const,
  status: ['onboarding', 'status'] as const,
  restaurant: ['onboarding', 'restaurant'] as const,
  purchases: ['onboarding', 'purchases'] as const,
  purchase: (purchaseId: string) => ['onboarding', 'purchases', purchaseId] as const,
  attempt: (purchaseId: string) => ['onboarding', 'purchases', purchaseId, 'attempt'] as const,
}
