import { useSyncExternalStore } from 'react'

/** True while the CSS media query matches (re-renders on change). False where matchMedia is missing. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const list = window.matchMedia(query)
      list.addEventListener?.('change', onChange)
      return () => list.removeEventListener?.('change', onChange)
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  )
}

/** Phones: the sidebar becomes a slide-in drawer below this width (matches the CSS breakpoint). */
export const PHONE_QUERY = '(max-width: 767px)'
