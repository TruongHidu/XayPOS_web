import { create } from 'zustand'
import type { PublicMenuItem } from '../../qr-menu/types'
import type { QrOrderFailure, QrReceipt, QrRequestInput } from '../types'
import { qrQuantitySchema } from '../schemas'
import { validateQrBody } from '../policies/qrOrderPolicy'
import { publicQrOrderApi } from '../api/publicQrOrderApi'
import { ensureQrGuest, qrScopeRequest, useQrGuestStore } from './qrOrderGuestStore'
import { QrOrderError, qrOrderError } from '../utils/qrOrderErrors'
import { quantityMilli } from '../../../shared/utils/scaledDecimal'
import { qrOrderId } from '../utils/qrOrderId'
export interface QrDraftLine {
  id: string
  item: PublicMenuItem
  quantity: string
  note: string
}
export interface QrCustomerFields {
  customerName: string
  customerPhone: string
  note: string
}
interface QrIntent {
  scopeId: string
  guestToken: string
  key: string
  body: QrRequestInput
}
interface DraftState {
  scopeId: string
  lines: QrDraftLine[]
  fields: QrCustomerFields
  intent: QrIntent | null
  pending: boolean
  unresolved: boolean
  error: QrOrderFailure | null
  reset: (scopeId: string) => void
  add: (item: PublicMenuItem, quantity?: string, note?: string) => boolean
  edit: (id: string, quantity: string, note: string) => void
  remove: (id: string) => void
  metadata: (fields: Partial<QrCustomerFields>) => void
  refreshItems: (items: PublicMenuItem[]) => void
  submit: () => Promise<QrReceipt | null>
}
const emptyFields = (): QrCustomerFields => ({ customerName: '', customerPhone: '', note: '' })
export const qrDraftFrozen = (state: Pick<DraftState, 'pending' | 'unresolved'>) => state.pending || state.unresolved
export const qrDraftDirty = (state: Pick<DraftState, 'lines' | 'fields'>) =>
  state.lines.length > 0 || Object.values(state.fields).some(Boolean)
export const useQrDraftStore = create<DraftState>((set, get) => ({
  scopeId: '',
  lines: [],
  fields: emptyFields(),
  intent: null,
  pending: false,
  unresolved: false,
  error: null,
  reset: (scopeId) => {
    const runtime = useQrGuestStore.getState()
    const recovery = runtime.scopeId === scopeId && !runtime.invalid && runtime.guest ? runtime.recovery : null
    const intent = recovery
      ? Object.freeze({ scopeId, guestToken: runtime.guest!.guestToken, key: recovery.key, body: recovery.body })
      : null
    if (intent) {
      intent.body.items.forEach(Object.freeze)
      Object.freeze(intent.body.items)
      Object.freeze(intent.body)
    }
    const fields = intent
      ? {
          customerName: intent.body.customerName ?? '',
          customerPhone: intent.body.customerPhone ?? '',
          note: intent.body.note ?? '',
        }
      : emptyFields()
    set({
      scopeId,
      lines: recovery?.lines ?? [],
      fields,
      intent,
      pending: false,
      unresolved: !!intent,
      error: recovery?.blocked ? qrOrderError(new QrOrderError('IDEMPOTENCY_KEY_REUSED')) : null,
    })
  },
  add: (item, quantity = '1', note = '') => {
    const state = get()
    if (
      qrDraftFrozen(state) ||
      !state.scopeId ||
      useQrGuestStore.getState().scopeId !== state.scopeId ||
      item.availabilityStatus !== 'AVAILABLE'
    )
      return false
    try {
      qrQuantitySchema.parse(Number(quantity))
      quantityMilli(quantity)
      if (state.lines.length >= 20 || note.length > 500) throw new Error('limit')
      set({ lines: [...state.lines, { id: qrOrderId(), item, quantity, note }], error: null })
      return true
    } catch {
      set({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Giỏ tối đa 20 dòng, số lượng từ 0,001 đến 20; ghi chú tối đa 500 ký tự.',
          fieldErrors: {},
          unknownOutcome: false,
        },
      })
      return false
    }
  },
  edit: (id, quantity, note) => {
    if (qrDraftFrozen(get())) return
    try {
      quantityMilli(quantity)
      qrQuantitySchema.parse(Number(quantity))
      if (note.length > 500) throw new Error('limit')
    } catch {
      set({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Số lượng từ 0,001 đến 20; ghi chú tối đa 500 ký tự.',
          fieldErrors: {},
          unknownOutcome: false,
        },
      })
      return
    }
    set({ lines: get().lines.map((line) => (line.id === id ? { ...line, quantity, note } : line)), error: null })
  },
  remove: (id) => {
    if (!qrDraftFrozen(get())) set({ lines: get().lines.filter((line) => line.id !== id), error: null })
  },
  metadata: (fields) => {
    if (!qrDraftFrozen(get())) set({ fields: { ...get().fields, ...fields }, error: null })
  },
  refreshItems: (items) => {
    if (qrDraftFrozen(get()) || !get().lines.length) return
    const map = new Map(items.map((item) => [item.id, item]))
    set({
      lines: get().lines.map((line) => (map.has(line.item.id) ? { ...line, item: map.get(line.item.id)! } : line)),
    })
  },
  submit: async () => {
    const state = get()
    const runtime = useQrGuestStore.getState()
    if (runtime.guest && Date.parse(runtime.guest.expiresAt) <= Date.now()) {
      useQrGuestStore.setState({ invalid: true })
      set({ error: qrOrderError(new QrOrderError('QR_GUEST_ACCESS_INVALID')) })
      return null
    }
    if (
      state.pending ||
      !runtime.entry ||
      runtime.scopeId !== state.scopeId ||
      runtime.invalid ||
      runtime.unavailable ||
      runtime.cooldownUntil > Date.now() ||
      state.error?.code === 'IDEMPOTENCY_KEY_REUSED'
    )
      return null
    const scope = state.scopeId
    let intent = state.intent
    try {
      let body = intent?.body
      if (!body) {
        if (state.lines.some((line) => line.item.availabilityStatus !== 'AVAILABLE'))
          throw new QrOrderError('ITEM_OUT_OF_STOCK')
        for (const line of state.lines) quantityMilli(line.quantity)
        body = validateQrBody(runtime.entry, {
          ...state.fields,
          items: state.lines.map((line) => ({
            itemId: line.item.id,
            quantity: Number(line.quantity),
            note: line.note,
          })),
        })
        body.items.forEach(Object.freeze)
        Object.freeze(body.items)
        Object.freeze(body)
      }
      set({ pending: true, error: null })
      if (!intent) {
        const guest = await ensureQrGuest(scope)
        if (get().scopeId !== scope) return null
        intent = Object.freeze({ scopeId: scope, guestToken: guest.guestToken, key: qrOrderId(), body })
        set({ intent })
        // Persist before POST: a reload may interrupt the response after the server has accepted it.
        useQrGuestStore.setState({
          recovery: { key: intent.key, body: intent.body, blocked: false, lines: state.lines },
        })
      }
      const request = qrScopeRequest(scope)
      let receipt: QrReceipt
      try {
        receipt = (
          await publicQrOrderApi.submit(runtime.entry, intent.guestToken, intent.body, intent.key, request.signal)
        ).receipt
        request.assert()
      } finally {
        request.release()
      }
      if (get().scopeId !== scope) return null
      useQrGuestStore.getState().remember(receipt.requestId, intent.key)
      set({
        lines: [],
        fields: { ...state.fields, note: '' },
        intent: null,
        pending: false,
        unresolved: false,
        error: null,
      })
      return receipt
    } catch (error) {
      if (get().scopeId !== scope || useQrGuestStore.getState().scopeId !== scope) return null
      const failure = qrOrderError(error)
      useQrGuestStore.getState().fail(failure)
      const unresolved = !!intent && (state.unresolved || failure.unknownOutcome || failure.status === 429)
      useQrGuestStore.setState({
        recovery:
          unresolved && intent
            ? {
                key: intent.key,
                body: intent.body,
                blocked: failure.code === 'IDEMPOTENCY_KEY_REUSED',
                lines: state.lines,
              }
            : null,
      })
      set({ pending: false, error: failure, unresolved, intent: unresolved ? intent : null })
      return null
    }
  },
}))
useQrGuestStore.subscribe((state, previous) => {
  if (state.scopeId !== previous.scopeId) useQrDraftStore.getState().reset(state.scopeId)
})
