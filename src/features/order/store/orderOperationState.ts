import { create } from 'zustand'
import type { NormalizedApiError } from '../../../shared/types/auth'
import type { AddItemsInput } from '../types'
export interface AppendIntent {
  orderId: string
  input: AddItemsInput
  key: string
}
interface OperationState {
  busy: ReadonlySet<string>
  uncertain: ReadonlySet<string>
  refusals: ReadonlyMap<string, NormalizedApiError>
  appends: ReadonlyMap<string, AppendIntent>
}
export const useOrderOperationState = create<OperationState>(() => ({
  busy: new Set(),
  uncertain: new Set(),
  refusals: new Map(),
  appends: new Map(),
}))
export const operationKey = (scope: string, id: string) => scope + '::' + id
export function lockOrder(key: string, replay = false) {
  const s = useOrderOperationState.getState()
  if (s.busy.has(key) || (s.uncertain.has(key) && !replay) || s.refusals.has(key))
    throw new Error('ORDER_RESULT_UNCERTAIN')
  useOrderOperationState.setState({ busy: new Set([...s.busy, key]) })
}
export function unlockOrder(key: string) {
  const s = useOrderOperationState.getState()
  useOrderOperationState.setState({ busy: new Set([...s.busy].filter((k) => k !== key)) })
}
export function verifyOrder(key: string) {
  const s = useOrderOperationState.getState()
  if (s.appends.has(key)) return
  useOrderOperationState.setState({ uncertain: new Set([...s.uncertain].filter((k) => k !== key)) })
}
export function saveAppend(key: string, intent: AppendIntent) {
  const appends = new Map(useOrderOperationState.getState().appends)
  appends.set(key, intent)
  useOrderOperationState.setState({ appends })
}
export function clearAppend(key: string) {
  const appends = new Map(useOrderOperationState.getState().appends)
  appends.delete(key)
  useOrderOperationState.setState({ appends })
}
export function markOrderUncertain(key: string) {
  const s = useOrderOperationState.getState()
  useOrderOperationState.setState({ uncertain: new Set([...s.uncertain, key]) })
}
export function markOrderRefusal(key: string, error: NormalizedApiError) {
  const s = useOrderOperationState.getState()
  const refusals = new Map(s.refusals)
  refusals.set(key, error)
  useOrderOperationState.setState({ refusals })
}
export function resetOrderOperations() {
  useOrderOperationState.setState({ busy: new Set(), uncertain: new Set(), refusals: new Map(), appends: new Map() })
}
