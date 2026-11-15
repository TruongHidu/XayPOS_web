import { create } from 'zustand'
import { normalizeApiError } from '../errors/normalizeApiError'

export type ToastTone = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

interface ToastState {
  items: ToastItem[]
  push: (tone: ToastTone, message: string, durationMs?: number) => number
  dismiss: (id: number) => void
  clear: () => void
}

let nextId = 1
const MAX_VISIBLE = 4

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (tone, message, durationMs = tone === 'error' ? 7000 : 4000) => {
    const id = nextId++
    set((state) => ({ items: [...state.items, { id, tone, message }].slice(-MAX_VISIBLE) }))
    if (durationMs > 0) setTimeout(() => get().dismiss(id), durationMs)
    return id
  },
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
  clear: () => set({ items: [] }),
}))

/**
 * App-wide notifications. Pages call `toast.success('Đã lưu')` instead of
 * keeping their own toast state; `<Toaster />` (mounted by the portal shell)
 * renders them.
 */
export const toast = {
  success: (message: string) => useToastStore.getState().push('success', message),
  info: (message: string) => useToastStore.getState().push('info', message),
  warning: (message: string) => useToastStore.getState().push('warning', message),
  /** Accepts a message or any error (normalised to its user-facing message). */
  error: (error: unknown, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.') =>
    useToastStore
      .getState()
      .push('error', typeof error === 'string' ? error : (normalizeApiError(error).message || fallback)),
}
