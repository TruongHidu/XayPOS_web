import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../auth/store/authStore'
import { ordersApi } from '../api/ordersApi'
import { orderKeys } from '../api/orderKeys'
import { cacheOrderSnapshot } from '../api/orderSnapshot'
import { canOrder, canSubmitType, orderScope } from '../policies/orderAccessPolicy'
import {
  cancellable,
  confirmable,
  editable,
  appendable,
  lineCancellable,
  lineCancelPermission,
} from '../policies/orderActionPolicy'
import { orderError } from '../utils/orderErrors'
import { unresolvedResult } from '../utils/orderErrors'
import { addItemsSchema } from '../schemas'
import { newOrderId } from '../utils/orderId'
import { useOrderAccess } from './useOrderAccess'
import {
  lockOrder,
  markOrderRefusal,
  markOrderUncertain,
  operationKey,
  unlockOrder,
  useOrderOperationState,
  clearAppend,
  saveAppend,
  verifyOrder,
} from '../store/orderOperationState'
import { useOrderDraftStore } from '../store/orderDraftStore'
import { recordAppendedLines } from '../utils/orderAppended'
import type { AddItemsInput, CancelInput, Order, UpdateLineInput, UpdateOrderInput } from '../types'
export type OrderCommand =
  | { kind: 'update'; input: UpdateOrderInput }
  | { kind: 'add'; input: AddItemsInput; retry?: boolean }
  | { kind: 'line'; lineId: string; input: UpdateLineInput }
  | { kind: 'confirm'; input: { expectedVersion: number } }
  | { kind: 'cancel'; input: CancelInput }
  | { kind: 'cancelLine'; lineId: string; input: CancelInput }
export function commandAllowed(order: Order, command: OrderCommand, access: ReturnType<typeof useAuthStore.getState>) {
  const line = 'lineId' in command ? order.items.find((l) => l.id === command.lineId) : undefined
  const permission =
    command.kind === 'cancel'
      ? 'ORDER_CANCEL'
      : command.kind === 'cancelLine'
        ? lineCancelPermission(order)
        : 'ORDER_UPDATE'
  if (!canOrder(access, permission)) return false
  switch (command.kind) {
    case 'update':
      return editable(order)
    case 'add':
      return command.input.submissionMode === 'SUBMIT'
        ? canSubmitType(access, order.serviceType) && appendable(order)
        : editable(order)
    case 'line':
      return editable(order) && line?.status === 'PENDING'
    case 'confirm':
      return confirmable(order)
    case 'cancel':
      return cancellable(order)
    case 'cancelLine':
      return !!line && lineCancellable(order, line)
  }
}
export function useOrderMutations(order: Order) {
  const { scope } = useOrderAccess()
  const client = useQueryClient()
  const key = scope ? operationKey(scope, order.id) : ''
  const busy = useOrderOperationState((s) => s.busy.has(key))
  const uncertain = useOrderOperationState((s) => s.uncertain.has(key) || s.refusals.has(key))
  const appendIntent = useOrderOperationState((s) => s.appends.get(key))
  const mutation = useMutation({
    mutationKey: ['cashier', scope, 'mutation', order.id],
    retry: false,
    mutationFn: async (command: OrderCommand) => {
      const replay = command.kind === 'add' && command.retry === true
      const saved = useOrderOperationState.getState().appends.get(key)
      if (
        !scope ||
        orderScope(useAuthStore.getState()) !== scope ||
        (replay
          ? !saved || saved.orderId !== order.id || !canSubmitType(useAuthStore.getState(), order.serviceType)
          : !commandAllowed(order, command, useAuthStore.getState()))
      )
        throw new Error('ORDER_ACCESS_CHANGED')
      const cached = client.getQueryData<Order>(orderKeys.detail(scope, order.id))
      const dirty = client.getQueryState(orderKeys.detail(scope, order.id))?.isInvalidated
      if (!replay && (dirty || (cached && cached.version !== command.input.expectedVersion))) {
        markOrderUncertain(key)
        throw new Error('CONCURRENT_ORDER_UPDATE')
      }
      lockOrder(key, replay)
      try {
        if (command.kind === 'add' && !replay && command.input.submissionMode === 'SUBMIT') {
          const input = addItemsSchema.parse(command.input)
          input.items.forEach(Object.freeze)
          Object.freeze(input.items)
          Object.freeze(input)
          saveAppend(key, { orderId: order.id, input, key: newOrderId() })
        }
        await client.cancelQueries({ queryKey: orderKeys.detail(scope, order.id), exact: true })
        let response: Order
        switch (command.kind) {
          case 'update':
            response = await ordersApi.update(scope, order.id, command.input)
            break
          case 'add':
            {
              const intent = useOrderOperationState.getState().appends.get(key)
              response = (await ordersApi.add(scope, order.id, intent?.input ?? command.input, intent?.key)).order
            }
            break
          case 'line':
            response = await ordersApi.updateLine(scope, order.id, command.lineId, command.input)
            break
          case 'confirm':
            response = await ordersApi.confirm(scope, order.id, command.input.expectedVersion)
            break
          case 'cancel':
            response = await ordersApi.cancel(scope, order.id, command.input)
            break
          case 'cancelLine':
            response = await ordersApi.cancelLine(scope, order.id, command.lineId, command.input)
            break
        }
        if (orderScope(useAuthStore.getState()) !== scope) throw new Error('ORDER_ACCESS_CHANGED')
        await client.cancelQueries({ queryKey: orderKeys.detail(scope, order.id), exact: true })
        response = cacheOrderSnapshot(client, scope, response)
        if (command.kind === 'add') {
          clearAppend(key)
          const prevIds = new Set(order.items.map((i) => i.id))
          const newIds = response.items.filter((i) => !prevIds.has(i.id)).map((i) => i.id)
          recordAppendedLines(order.id, newIds)
        }
        verifyOrder(key)
        void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
        void client.invalidateQueries({ queryKey: orderKeys.activeOrders(scope) })
        void client.invalidateQueries({ queryKey: ['cashier', scope, 'kitchen'] })
        const draft = useOrderDraftStore.getState()
        if (draft.scope === scope && draft.result?.id === response.id) useOrderDraftStore.setState({ result: response })
        return response
      } catch (error) {
        const f = orderError(error)
        if (command.kind === 'add' && orderScope(useAuthStore.getState()) === scope && !unresolvedResult(error))
          clearAppend(key)
        if (f.code === 'CONCURRENT_ORDER_UPDATE' && scope && canOrder(useAuthStore.getState(), 'ORDER_VIEW'))
          void client.invalidateQueries({ queryKey: orderKeys.detail(scope, order.id), exact: true })
        if (f.status === 403 && orderScope(useAuthStore.getState()) === scope) markOrderRefusal(key, f)
        if (
          orderScope(useAuthStore.getState()) === scope &&
          !['VALIDATION_ERROR', 'ORDER_ACCESS_CHANGED'].includes(f.code) &&
          (f.isNetworkError || !f.status || f.status >= 500 || f.status === 409 || f.status === 404)
        )
          markOrderUncertain(key)
        throw error
      } finally {
        unlockOrder(key)
      }
    },
  })
  return { ...mutation, busy: busy || mutation.isPending, uncertain, appendIntent }
}
