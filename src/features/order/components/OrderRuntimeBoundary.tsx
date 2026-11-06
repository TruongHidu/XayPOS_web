import { useEffect, type PropsWithChildren } from 'react'
import { useAuthStore } from '../../auth/store/authStore'
import { orderScope } from '../policies/orderAccessPolicy'
import { useOrderDraftStore } from '../store/orderDraftStore'
import { queryClient } from '../../../shared/api/queryClient'
import { orderKeys } from '../api/orderKeys'
import { resetOrderOperations } from '../store/orderOperationState'

/** Above TenantPortal: entitlement loading may unmount POS without losing its draft. */
export function OrderRuntimeBoundary({ children }: PropsWithChildren) {
  useEffect(() => {
    const sync = () => {
      const next = orderScope(useAuthStore.getState())
      const previous = useOrderDraftStore.getState().scope
      if (next === previous) return
      useOrderDraftStore.getState().sync(next)
      resetOrderOperations()
      if (previous) {
        void queryClient.cancelQueries({ queryKey: orderKeys.root(previous) })
        queryClient.removeQueries({ queryKey: orderKeys.root(previous) })
      }
    }
    sync()
    return useAuthStore.subscribe(sync)
  }, [])
  return children
}
