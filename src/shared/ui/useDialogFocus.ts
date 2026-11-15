import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal focus behaviour shared by Modal, Drawer and ConfirmDialog: focus the
 * first control on open, keep Tab inside, close on Escape, and give focus back
 * to the element that opened the dialog.
 */
export function useDialogFocus(containerRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = containerRef.current?.querySelector<HTMLElement>(
      '[data-autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
    )
    first?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Only the topmost dialog reacts.
        const dialogs = document.querySelectorAll('[aria-modal="true"]')
        if (dialogs[dialogs.length - 1] !== containerRef.current) return
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      if (focusable.length === 0) return
      const firstItem = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [containerRef])
}
