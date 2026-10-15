import { useEffect } from 'react'
import { qrDraftDirty, useQrDraftStore } from '../store/qrOrderDraftStore'
import { useQrGuestStore } from '../store/qrOrderGuestStore'
import { entryPath } from '../policies/qrOrderPolicy'
export function useQrOrderNavigationGuard() {
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      const state = useQrDraftStore.getState()
      if (!state.pending && !state.unresolved && !qrDraftDirty(state)) return
      event.preventDefault()
      event.returnValue = ''
    }
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const entry = useQrGuestStore.getState().entry
      const target = new URL(anchor.href, window.location.href)
      const base = entry ? entryPath(entry) : ''
      if (
        target.origin === window.location.origin &&
        (target.pathname === base || target.pathname.startsWith(base + '/requests/'))
      )
        return
      const state = useQrDraftStore.getState()
      if (
        (state.pending || state.unresolved || qrDraftDirty(state)) &&
        !window.confirm(
          'Giỏ và lượt gọi món này chỉ được giữ trong phiên hiện tại. Kiểm tra với nhà hàng nếu kết quả gửi chưa rõ. Bạn muốn rời trang?',
        )
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('beforeunload', unload)
      document.removeEventListener('click', click, true)
    }
  }, [])
}
