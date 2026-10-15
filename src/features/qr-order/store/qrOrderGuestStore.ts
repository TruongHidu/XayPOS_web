import { create } from 'zustand'
import type { GuestAccess, PublicEntry, QrOrderFailure } from '../types'
import { publicQrOrderApi } from '../api/publicQrOrderApi'
import { publicEntrySchema } from '../schemas'
import { QrOrderError, qrOrderError } from '../utils/qrOrderErrors'
import { qrOrderId } from '../utils/qrOrderId'
import { clearQrSession, readQrSession, writeQrSession, type StoredQrIntent } from '../storage/qrOrderSessionStorage'
import { resourceId } from '../../../shared/api/tenantSchemas'

interface GuestState {
  entry: PublicEntry | null
  scopeId: string
  epoch: number
  guest: GuestAccess | null
  requestIds: string[]
  invalid: boolean
  unavailable: boolean
  cooldownUntil: number
  recovery: StoredQrIntent | null
  storageAvailable: boolean
  sync: (entry: PublicEntry | null, restart?: boolean) => void
  remember: (requestId: string, settledKey?: string) => void
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
  recovery: null,
  storageAvailable: true,
  sync: (entry, restart = false) => {
    const previous = get()
    if (!restart && previous.entry?.entryType === entry?.entryType && previous.entry?.token === entry?.token) return
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
    mint = null
    const valid = entry && publicEntrySchema.safeParse(entry).success ? entry : null
    const cleared = restart && valid ? clearQrSession(valid) : true
    const restored = valid && !restart ? readQrSession(valid) : { session: null, available: cleared }
    const saved = restored.session
    set({
      entry: valid,
      scopeId: valid ? qrOrderId() : '',
      epoch: previous.epoch + 1,
      guest: saved?.guest ?? null,
      requestIds: saved?.requestIds ?? [],
      invalid: saved?.invalid ?? false,
      unavailable: false,
      cooldownUntil: saved?.cooldownUntil ?? 0,
      recovery: saved?.recovery ?? null,
      storageAvailable: restored.available,
    })
  },
  remember: (id, settledKey) => {
    const requestId = resourceId.parse(id)
    const state = get()
    const recovery = settledKey && state.recovery?.key === settledKey ? null : state.recovery
    if (state.requestIds.includes(requestId) && recovery === state.recovery) return
    set({ requestIds: [...new Set([...state.requestIds, requestId])].slice(-1000), recovery })
  },
  fail: (failure) =>
    set({
      invalid: get().invalid || failure.code === 'QR_GUEST_ACCESS_INVALID',
      unavailable: get().unavailable || failure.code === 'QR_ORDER_UNAVAILABLE',
      cooldownUntil: Math.max(get().cooldownUntil, failure.retryAt ?? 0),
    }),
}))
useQrGuestStore.subscribe((state, previous) => {
  if (
    !state.entry ||
    (state.entry === previous.entry &&
      state.guest === previous.guest &&
      state.requestIds === previous.requestIds &&
      state.invalid === previous.invalid &&
      state.recovery === previous.recovery &&
      state.cooldownUntil === previous.cooldownUntil)
  )
    return
  const available = writeQrSession({
    version: 1,
    entry: state.entry,
    guest: state.guest,
    requestIds: state.requestIds,
    invalid: state.invalid,
    recovery: state.recovery,
    cooldownUntil: state.cooldownUntil,
  })
  if (state.storageAvailable !== available) useQrGuestStore.setState({ storageAvailable: available })
})
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
