import { create } from 'zustand'
import type { GuestAccess, PublicEntry, QrOrderFailure } from '../types'
import { publicQrOrderApi } from '../api/publicQrOrderApi'
import { publicEntrySchema } from '../schemas'
import { QrOrderError, qrOrderError } from '../utils/qrOrderErrors'
import { qrOrderId } from '../utils/qrOrderId'

interface GuestState {
  entry: PublicEntry | null
  scopeId: string
  epoch: number
  guest: GuestAccess | null
  requestIds: string[]
  invalid: boolean
  unavailable: boolean
  cooldownUntil: number
  sync: (entry: PublicEntry | null, restart?: boolean) => void
  remember: (requestId: string) => void
  fail: (failure: QrOrderFailure) => void
}
const controllers = new Set<AbortController>()
let mint: { scope: string; promise: Promise<GuestAccess> } | null = null
export const useQrGuestStore = create<GuestState>((set, get) => ({
  entry: null,
  scopeId: '',
  epoch: 0,
  guest: null,
  requestIds: [],
  invalid: false,
  unavailable: false,
  cooldownUntil: 0,
  sync: (entry, restart = false) => {
    const previous = get()
    if (!restart && previous.entry?.entryType === entry?.entryType && previous.entry?.token === entry?.token) return
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
    mint = null
    const valid = entry && publicEntrySchema.safeParse(entry).success ? entry : null
    set({
      entry: valid,
      scopeId: valid ? qrOrderId() : '',
      epoch: previous.epoch + 1,
      guest: null,
      requestIds: [],
      invalid: false,
      unavailable: false,
      cooldownUntil: 0,
    })
  },
  remember: (id) => set({ requestIds: [...new Set([...get().requestIds, id])] }),
  fail: (failure) =>
    set({
      invalid: get().invalid || failure.code === 'QR_GUEST_ACCESS_INVALID',
      unavailable: get().unavailable || failure.code === 'QR_ORDER_UNAVAILABLE',
      cooldownUntil: Math.max(get().cooldownUntil, failure.retryAt ?? 0),
    }),
}))
export function qrScopeRequest(scope: string) {
  if (!scope || useQrGuestStore.getState().scopeId !== scope) throw new QrOrderError('QR_SCOPE_CHANGED')
  const controller = new AbortController()
  controllers.add(controller)
  return {
    signal: controller.signal,
    assert: () => {
      if (controller.signal.aborted || useQrGuestStore.getState().scopeId !== scope)
        throw new QrOrderError('QR_SCOPE_CHANGED')
    },
    release: () => controllers.delete(controller),
  }
}
export async function ensureQrGuest(scope: string) {
  const state = useQrGuestStore.getState()
  if (state.scopeId !== scope || !state.entry) throw new QrOrderError('QR_SCOPE_CHANGED')
  if (state.invalid || (state.guest && Date.parse(state.guest.expiresAt) <= Date.now())) {
    useQrGuestStore.setState({ invalid: true })
    throw new QrOrderError('QR_GUEST_ACCESS_INVALID')
  }
  if (state.guest) return state.guest
  if (mint?.scope === scope) return mint.promise
  const request = qrScopeRequest(scope)
  const promise = publicQrOrderApi
    .guest(state.entry, request.signal)
    .then((guest) => {
      request.assert()
      if (Date.parse(guest.expiresAt) <= Date.now()) throw new QrOrderError('QR_GUEST_ACCESS_INVALID')
      useQrGuestStore.setState({ guest })
      return guest
    })
    .catch((error: unknown) => {
      if (useQrGuestStore.getState().scopeId === scope) useQrGuestStore.getState().fail(qrOrderError(error))
      throw error
    })
    .finally(() => {
      request.release()
      if (mint?.scope === scope) mint = null
    })
  mint = { scope, promise }
  return promise
}
