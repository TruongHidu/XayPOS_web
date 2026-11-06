import type { AxiosRequestConfig } from 'axios'
import { useAuthStore } from '../../features/auth/store/authStore'
import { tenantScope } from '../auth/tenantScope'

let current = tenantScope(useAuthStore.getState())
let epoch = 0
// A -> B -> A is still a new session boundary; an old request cannot become valid again.
useAuthStore.subscribe((state) => {
  const next = tenantScope(state)
  if (next !== current) {
    current = next
    epoch++
  }
})
export function tenantRequest(scope: string | null, signal?: AbortSignal): AxiosRequestConfig {
  const capturedEpoch = epoch
  const revision = useAuthStore.getState().sessionRevision
  return {
    signal,
    timeout: 20000,
    isScopeCurrent: () =>
      scope !== null &&
      epoch === capturedEpoch &&
      revision === useAuthStore.getState().sessionRevision &&
      tenantScope(useAuthStore.getState()) === scope,
  }
}
