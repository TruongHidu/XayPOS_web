import { useEffect, useRef } from 'react'

/**
 * Warns before leaving a page with unsaved input (stock-audit count sheets,
 * long forms). The app keeps BrowserRouter, so like useDraftNavigationGuard
 * this intercepts in-app link clicks and the browser unload instead of a
 * data-router blocker.
 */
export function useUnsavedChangesGuard(dirty: boolean, message = 'Bạn còn thay đổi chưa lưu. Rời trang và bỏ các thay đổi này?') {
  const state = useRef({ dirty, message })
  useEffect(() => {
    state.current = { dirty, message }
  }, [dirty, message])
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (!state.current.dirty || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return
      if (new URL(link.href, window.location.href).href === window.location.href) return
      if (!window.confirm(state.current.message)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const unload = (event: BeforeUnloadEvent) => {
      if (!state.current.dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    document.addEventListener('click', click, true)
    window.addEventListener('beforeunload', unload)
    return () => {
      document.removeEventListener('click', click, true)
      window.removeEventListener('beforeunload', unload)
    }
  }, [])
}
