import { useCallback, useRef, useState } from 'react'
import { env } from '../config/env'
import type { TurnstileWidgetHandle } from './TurnstileWidget'

const REFRESH_TIMEOUT_MS = 60_000

/**
 * Token lifecycle for one Turnstile widget. Without `VITE_TURNSTILE_SITE_KEY` the CAPTCHA is not required, no widget
 * is rendered and no token is sent (local dev and tests behave as before).
 */
export function useCaptcha(action: string) {
  const siteKey = env.turnstileSiteKey
  const widgetRef = useRef<TurnstileWidgetHandle>(null)
  const waiting = useRef<((token: string) => void) | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const onToken = useCallback((value: string) => {
    setToken(value)
    setFailed(false)
    waiting.current?.(value)
    waiting.current = null
  }, [])
  const onExpire = useCallback(() => setToken(null), [])
  const onError = useCallback(() => {
    setToken(null)
    setFailed(true)
  }, [])

  /** Tokens are single-use: call after every request that sent one, whatever its outcome. */
  const reset = useCallback(() => {
    setToken(null)
    widgetRef.current?.reset()
  }, [])

  /** Resets the widget and resolves with its next token; a managed widget usually re-solves on its own. */
  const refresh = useCallback(
    () =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiting.current = null
          reject(new Error('CAPTCHA_REQUIRED'))
        }, REFRESH_TIMEOUT_MS)
        waiting.current = (value) => {
          clearTimeout(timer)
          resolve(value)
        }
        reset()
      }),
    [reset],
  )

  return {
    required: Boolean(siteKey),
    token,
    failed,
    reset,
    refresh,
    widgetRef,
    widgetProps: siteKey ? { siteKey, action, onToken, onExpire, onError } : null,
  }
}
