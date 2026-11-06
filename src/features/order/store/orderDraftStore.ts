import { create } from 'zustand'
import type { PrivateMenuItem } from '../../menu/schemas'
import type { CreateOrderInput, Order, ServiceContext } from '../types'
import { createOrderSchema } from '../schemas'
import { previewLine, quantityMilli } from '../../../shared/utils/scaledDecimal'
import { newOrderId } from '../utils/orderId'
import { isOrderAcceptanceRefusal, orderError, unresolvedResult } from '../utils/orderErrors'
import { useAuthStore } from '../../auth/store/authStore'
import { canCreateType, canMenu, hasPermission, orderScope } from '../policies/orderAccessPolicy'
import { ordersApi } from '../api/ordersApi'
import { orderKeys } from '../api/orderKeys'
import { queryClient } from '../../../shared/api/queryClient'
import type { NormalizedApiError } from '../../../shared/types/auth'

export interface DraftLine {
  id: string
  item: PrivateMenuItem
  quantity: string
  note: string
}
export interface OrderMetadata {
  customerName: string
  customerPhone: string
  guestCount: string
  note: string
}
export interface SubmittedCreate {
  key: string
  input: CreateOrderInput
}
interface DraftState {
  scope: string | null
  context: ServiceContext | null
  lines: DraftLine[]
  metadata: OrderMetadata
  pending: boolean
  uncertain: boolean
  refused: boolean
  submitted: SubmittedCreate | null
  result: Order | null
  error: NormalizedApiError | null
  sync: (scope: string | null) => void
  start: (context: ServiceContext) => boolean
  add: (item: PrivateMenuItem) => void
  edit: (id: string, quantity: string, note: string) => void
  remove: (id: string) => void
  fields: (fields: Partial<OrderMetadata>) => void
  discard: () => boolean
  submit: () => Promise<Order | null>
}
const emptyMetadata = (): OrderMetadata => ({ customerName: '', customerPhone: '', guestCount: '1', note: '' })
const empty = () => ({
  context: null,
  lines: [],
  metadata: emptyMetadata(),
  pending: false,
  uncertain: false,
  refused: false,
  submitted: null,
  result: null,
  error: null,
})
export function draftDirty(state: Pick<DraftState, 'lines' | 'metadata'>) {
  return (
    state.lines.length > 0 || !!state.metadata.customerName || !!state.metadata.customerPhone || !!state.metadata.note
  )
}
export const draftFrozen = (s: Pick<DraftState, 'pending' | 'uncertain' | 'refused' | 'result'>) =>
  s.pending || s.uncertain || s.refused || !!s.result
export const draftTotal = (lines: DraftLine[]) =>
  lines.reduce((sum, line) => sum + previewLine(line.item.salePrice, line.quantity), 0n)
export const useOrderDraftStore = create<DraftState>((set, get) => ({
  scope: null,
  ...empty(),
  sync: (scope) => {
    if (scope !== get().scope) set({ scope, ...empty() })
  },
  start: (context) => {
    const s = get()
    if (
      s.context?.serviceType === context.serviceType &&
      s.context.tableSessionId === context.tableSessionId &&
      s.context.tableId === context.tableId
    )
      return true
    if (s.pending || s.uncertain || (!s.result && draftDirty(s))) return false
    set({ ...empty(), context, metadata: { ...emptyMetadata(), guestCount: String(context.guestCount) } })
    return true
  },
  add: (item) => {
    const s = get()
    const access = useAuthStore.getState()
    if (
      draftFrozen(s) ||
      !canMenu(access) ||
      !s.context ||
      !canCreateType(access, s.context.serviceType) ||
      orderScope(access) !== s.scope ||
      !item.sellable
    )
      return
    const existingIndex = s.lines.findIndex((l) => l.item.id === item.id && !l.note)
    if (existingIndex >= 0) {
      const existing = s.lines[existingIndex]
      const currentQty = parseFloat(existing.quantity) || 0
      const nextQty = currentQty + 1
      const nextQtyStr = Number.isInteger(nextQty) ? String(nextQty) : String(Number(nextQty.toFixed(3)))
      const nextLines = [...s.lines]
      nextLines[existingIndex] = { ...existing, quantity: nextQtyStr }
      set({ lines: nextLines, error: null })
      return
    }
    if (s.lines.length >= 100) {
      set({ error: orderError(new Error('EMPTY_ORDER')) })
      return
    }
    set({ lines: [...s.lines, { id: newOrderId(), item, quantity: '1', note: '' }], error: null })
  },
  edit: (id, quantity, note) => {
    const s = get()
    if (draftFrozen(s) || orderScope(useAuthStore.getState()) !== s.scope) return
    try {
      quantityMilli(quantity)
      if (note.length > 2000) throw new Error('INVALID_QUANTITY')
      set({ lines: s.lines.map((l) => (l.id === id ? { ...l, quantity, note } : l)), error: null })
    } catch {
      set({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Số lượng >0, tối đa 3 thập phân; ghi chú tối đa 2000 ký tự.',
          fieldErrors: {},
          isNetworkError: false,
        },
      })
    }
  },
  remove: (id) => {
    if (!draftFrozen(get())) set({ lines: get().lines.filter((l) => l.id !== id) })
  },
  fields: (fields) => {
    if (!draftFrozen(get())) set({ metadata: { ...get().metadata, ...fields } })
  },
  discard: () => {
    if (get().pending || get().uncertain) return false
    set(empty())
    return true
  },
  submit: async () => {
    const s = get()
    const access = useAuthStore.getState()
    if (
      s.pending ||
      s.refused ||
      s.result ||
      !s.scope ||
      !s.context ||
      orderScope(access) !== s.scope ||
      !canCreateType(access, s.context.serviceType)
    )
      return null
    let submitted = s.submitted
    if (!submitted) {
      if (!canMenu(access)) return null
      try {
        if (s.context.tableId && !hasPermission(access, 'TABLE_OPEN')) throw new Error('TABLE_OPEN_REQUIRED')
        const guestText = s.metadata.guestCount.trim()
        if (!/^\d+$/.test(guestText)) throw new Error('INVALID_GUEST_COUNT')
        const input = createOrderSchema.parse({
          serviceType: s.context.serviceType,
          sourceChannel: 'CASHIER',
          submissionMode: 'SUBMIT',
          ...(s.context.tableId
            ? { tableId: s.context.tableId }
            : s.context.tableSessionId
              ? { tableSessionId: s.context.tableSessionId }
              : {}),
          ...s.metadata,
          guestCount: Number(guestText),
          items: s.lines.map((l) => ({ itemId: l.item.id, quantity: Number(l.quantity), note: l.note })),
        })
        if (draftTotal(s.lines) > 99999999999999n) throw new Error('ORDER_AMOUNT_LIMIT_EXCEEDED')
        input.items.forEach(Object.freeze)
        Object.freeze(input.items)
        Object.freeze(input)
        submitted = { key: newOrderId(), input }
        set({ submitted })
      } catch (error) {
        set({ error: orderError(error) })
        return null
      }
    }
    const scope = s.scope
    const frozen = submitted
    set({ pending: true, error: null })
    try {
      const { order } = await ordersApi.create(scope, frozen.input, frozen.key)
      if (get().scope !== scope || orderScope(useAuthStore.getState()) !== scope) return null
      set({ result: order, lines: [], uncertain: false, pending: false })
      queryClient.setQueryData(orderKeys.detail(scope, order.id), order)
      void queryClient.invalidateQueries({ queryKey: orderKeys.lists(scope) })
      void queryClient.invalidateQueries({ queryKey: orderKeys.tables(scope) })
      void queryClient.invalidateQueries({ queryKey: orderKeys.sessions(scope) })
      return order
    } catch (error) {
      if (get().scope !== scope || orderScope(useAuthStore.getState()) !== scope) return null
      const uncertain = unresolvedResult(error)
      const failure = orderError(error)
      if (isOrderAcceptanceRefusal(error)) void queryClient.invalidateQueries({ queryKey: orderKeys.menus(scope) })
      if (
        failure.status === 409 &&
        ['CONCURRENT_TABLE_UPDATE', 'TABLE_ALREADY_OCCUPIED', 'TABLE_SESSION_HAS_SERVING_ORDER'].includes(failure.code)
      ) {
        void queryClient.invalidateQueries({ queryKey: orderKeys.tables(scope) })
        void queryClient.invalidateQueries({ queryKey: orderKeys.sessions(scope) })
        void queryClient.invalidateQueries({ queryKey: orderKeys.activeOrders(scope) })
        void queryClient.invalidateQueries({ queryKey: ['cashier', scope, 'selected-table'] })
      }
      set({
        pending: false,
        error: failure,
        uncertain,
        refused: failure.status === 403,
        submitted: uncertain ? frozen : null,
      })
      return null
    }
  },
}))
