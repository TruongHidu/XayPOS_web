const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export interface TurnstileRenderOptions {
  sitekey: string
  action?: string
  callback: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
}

/** The part of Cloudflare's `window.turnstile` API this app uses. */
export interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loading: Promise<TurnstileApi> | undefined

/** Loads Cloudflare's script once; every widget shares the same promise. A failed load can be retried. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('CAPTCHA_SCRIPT_FAILED')))
    script.onerror = () => {
      loading = undefined
      script.remove()
      reject(new Error('CAPTCHA_SCRIPT_FAILED'))
    }
    document.head.appendChild(script)
  })
  return loading
}
