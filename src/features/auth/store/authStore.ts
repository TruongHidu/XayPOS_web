import { create } from 'zustand'
import { authApi } from '../api/authApi'
import { errorCode, normalizeApiError } from '../../../shared/errors/normalizeApiError'
import { queryClient } from '../../../shared/api/queryClient'
import { getAccessToken, refreshWithCoordinator, resetRefreshCoordinator, setAccessToken, tokenStorage } from '../../../shared/api/httpClient'
import type { AuthResponse, AuthStatus, AuthUser, CurrentEntitlement, EntitlementState, LoginRequest } from '../../../shared/types/auth'

interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  entitlement: CurrentEntitlement | null
  entitlementState: EntitlementState
  lastError: string | null
  signIn: (body: LoginRequest) => Promise<AuthResponse>
  refreshSession: () => Promise<AuthResponse>
  bootstrap: () => Promise<void>
  loadEntitlement: () => Promise<void>
  signOut: () => Promise<void>
  clearSession: () => void
}

const applyAuthResponse = (response: AuthResponse) => {
  setAccessToken(response.accessToken)
  tokenStorage.writeRefreshToken(response.refreshToken)
  useAuthStore.setState({ status: 'authenticated', user: response.user, lastError: null })
  if (proactiveTimer) clearTimeout(proactiveTimer)
  proactiveTimer = setTimeout(() => { void refreshWithCoordinator().catch(() => undefined) }, Math.max(1_000, (response.expiresIn - 60) * 1_000))
}

let proactiveTimer: ReturnType<typeof setTimeout> | null = null
let bootstrapPromise: Promise<void> | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'bootstrapping', user: null, entitlement: null, entitlementState: 'idle', lastError: null,
  signIn: async (body) => {
    const response = await authApi.login({ ...body, email: body.email.trim().toLowerCase(), deviceInfo: getDeviceInfo() })
    applyAuthResponse(response)
    await get().loadEntitlement()
    return response
  },
  refreshSession: async () => {
    const refreshToken = tokenStorage.readRefreshToken()
    if (!refreshToken) throw new Error('No refresh token')
    try {
      const response = await authApi.refresh({ refreshToken })
      applyAuthResponse(response)
      await get().loadEntitlement()
      return response
    } catch (error) {
      get().clearSession()
      throw error
    }
  },
  bootstrap: async () => {
    if (bootstrapPromise) return bootstrapPromise
    bootstrapPromise = (async () => {
    set({ status: 'bootstrapping', lastError: null })
    if (!tokenStorage.readRefreshToken()) { set({ status: 'unauthenticated' }); return }
    try { await refreshWithCoordinator() } catch (error) { set({ status: 'unauthenticated', lastError: normalizeApiError(error).message }) }
    })()
    try { await bootstrapPromise } finally { bootstrapPromise = null }
  },
  loadEntitlement: async () => {
    const user = get().user
    if (!user || user.role === 'SUPER_ADMIN' || user.restaurantId === null) { set({ entitlement: null, entitlementState: 'idle' }); return }
    set({ entitlementState: 'loading' })
    try {
      const entitlement = await authApi.entitlements()
      set({ entitlement, entitlementState: entitlement.status === 'ACTIVE' ? 'active' : 'inactive' })
    } catch (error) {
      const code = errorCode(error)
      if (code === 'SUBSCRIPTION_NOT_ACTIVE') set({ entitlement: null, entitlementState: 'inactive' })
      else set({ entitlement: null, entitlementState: 'error', lastError: normalizeApiError(error).message })
    }
  },
  signOut: async () => {
    const refreshToken = tokenStorage.readRefreshToken()
    try { if (refreshToken && getAccessToken()) await authApi.logout({ refreshToken }) } catch { /* Local logout must still complete when the server is unavailable. */ } finally { get().clearSession() }
  },
  clearSession: () => {
    if (proactiveTimer) clearTimeout(proactiveTimer)
    proactiveTimer = null
    setAccessToken(null)
    tokenStorage.clearRefreshToken()
    resetRefreshCoordinator()
    queryClient.clear()
    set({ status: 'unauthenticated', user: null, entitlement: null, entitlementState: 'idle', lastError: null })
  },
}))

function getDeviceInfo() {
  const value = `${navigator.userAgent} / ${navigator.platform}`
  return value.slice(0, 255)
}
