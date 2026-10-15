import { useEffect, useRef, type PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useQrGuestStore } from '../store/qrOrderGuestStore'
import { useQrEntry } from '../hooks/useQrEntry'
import { useQrOrderNavigationGuard } from '../hooks/useQrOrderNavigationGuard'
import { publicEntrySchema } from '../schemas'
export function QrOrderRuntimeBoundary({ children }: PropsWithChildren) {
  const entry = useQrEntry()
  const activeEntry = useQrGuestStore((state) => state.entry)
  useQrOrderNavigationGuard()
  const client = useQueryClient()
  const lifecycle = useRef({ generation: 0 })
  useEffect(() => {
    const owner = lifecycle.current
    const turn = ++owner.generation
    const unsubscribe = useQrGuestStore.subscribe((state, previous) => {
      if (state.scopeId === previous.scopeId) return
      if (previous.scopeId) {
        void client.cancelQueries({ queryKey: ['qr-order', previous.scopeId] })
        client.removeQueries({ queryKey: ['qr-order', previous.scopeId] })
      }
      if (previous.entry) {
        const key = ['qr-menu', previous.entry.entryType, previous.entry.token]
        void client.cancelQueries({ queryKey: key })
        client.removeQueries({ queryKey: key })
      }
    })
    return () => {
      unsubscribe()
      queueMicrotask(() => {
        if (owner.generation === turn) {
          useQrGuestStore.getState().sync(null)
          client.clear()
        }
      })
    }
  }, [client])
  const ready =
    !publicEntrySchema.safeParse(entry).success ||
    (activeEntry?.entryType === entry.entryType && activeEntry.token === entry.token)
  return ready ? children : <div role="status">Đang chuẩn bị thực đơn...</div>
}
