/**
 * The refresh token lives in an HttpOnly cookie that scripts cannot read. This flag only remembers that this browser
 * signed in, so anonymous visitors do not trigger a refresh call on every page load. It is not a credential.
 */
export const SESSION_HINT_KEY = 'pos.session'

export const sessionHint = {
  present: () => {
    try {
      return localStorage.getItem(SESSION_HINT_KEY) === '1'
    } catch {
      return false
    }
  },
  mark: () => {
    try {
      localStorage.setItem(SESSION_HINT_KEY, '1')
    } catch {
      /* Storage blocked: the session still works until the tab closes. */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(SESSION_HINT_KEY)
    } catch {
      /* Nothing to clear. */
    }
  },
  /** Fires when another tab signs out (the flag disappears). */
  onClearedElsewhere: (listener: () => void) => {
    const handler = (event: StorageEvent) => {
      if (event.key === SESSION_HINT_KEY && event.newValue === null) listener()
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  },
}
