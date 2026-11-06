import type { PropsWithChildren } from 'react'

export function OnboardingNotice({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <section className="onboarding-card onboarding-notice">
      <h1>{title}</h1>
      {children}
    </section>
  )
}
