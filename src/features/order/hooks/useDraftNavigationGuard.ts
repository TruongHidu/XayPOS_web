import { useEffect } from 'react'
import { draftDirty, useOrderDraftStore } from '../store/orderDraftStore'
import { useOrderOperationState } from '../store/orderOperationState'
export function confirmDraftExit(): boolean {
  const s = useOrderDraftStore.getState()
  if (s.result) return true
  if (s.pending || s.uncertain) {
    window.alert('Kết quả tạo chưa xác định. Hãy chờ hoặc kiểm tra lại bằng yêu cầu ban đầu.')
    return false
  }
  if (!draftDirty(s)) return true
  if (!window.confirm('Bỏ giỏ món chưa lưu?')) return false
  return s.discard()
}
/** BrowserRouter is retained; protect links and unload without a router replacement. */
export function useDraftNavigationGuard() {
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return
      const url = new URL(link.href, window.location.href)
      if (url.href === window.location.href) return
      if (!confirmDraftExit()) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const unload = (event: BeforeUnloadEvent) => {
      const s = useOrderDraftStore.getState()
      const hasAppend = useOrderOperationState.getState().appends.size > 0
      if (!hasAppend && (s.result || (!s.pending && !s.uncertain && !draftDirty(s)))) return
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
