import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { loadTurnstile, type TurnstileApi } from './turnstileScript'

export interface TurnstileWidgetHandle {
  /** Asks Cloudflare for a new token; the previous one is single-use. */
  reset: () => void
}

export interface TurnstileWidgetProps {
  ref?: Ref<TurnstileWidgetHandle>
  siteKey: string
  /** Must match the action the backend expects for this endpoint. */
  action: string
  onToken: (token: string) => void
  onExpire: () => void
  onError: () => void
}

/** Cloudflare Turnstile rendered explicitly, so it is created and removed with the component. */
export function TurnstileWidget({ ref, siteKey, action, onToken, onExpire, onError }: TurnstileWidgetProps) {
  const container = useRef<HTMLDivElement>(null)
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null)
  const callbacks = useRef({ onToken, onExpire, onError })

  // Latest callbacks without re-creating the widget (re-creating would discard a solved challenge).
  useEffect(() => {
    callbacks.current = { onToken, onExpire, onError }
  })

  useEffect(() => {
    let cancelled = false
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return
        const id = api.render(container.current, {
          sitekey: siteKey,
          action,
          callback: (token) => callbacks.current.onToken(token),
          'expired-callback': () => callbacks.current.onExpire(),
          'error-callback': () => callbacks.current.onError(),
        })
        widget.current = { api, id }
      })
      .catch(() => {
        if (!cancelled) callbacks.current.onError()
      })
    return () => {
      cancelled = true
      if (widget.current) widget.current.api.remove(widget.current.id)
      widget.current = null
    }
  }, [siteKey, action])

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        if (widget.current) widget.current.api.reset(widget.current.id)
      },
    }),
    [],
  )

  return <div ref={container} className="captcha-widget" />
}
