import { create } from 'zustand'
import { authApi } from '../api/authApi'
import { errorCode, normalizeApiError } from '../../../shared/errors/normalizeApiError'
import { queryClient } from '../../../shared/api/queryClient'
import { refreshWithCoordinator, resetRefreshCoordinator, setAccessToken } from '../../../shared/api/httpClient'
import { withCrossTabLock } from '../../../shared/api/crossTabLock'
import { sessionHint } from '../../../shared/storage/sessionHint'
import type {
  AuthResponse,
  AuthStatus,
  AuthUser,
  CurrentEntitlement,
  EntitlementState,
  LoginRequest,
  RegisterRestaurantRequest,
} from '../../../shared/types/auth'

interface AuthState {
  sessionRevision: number
  status: AuthStatus
  user: AuthUser | null
  entitlement: CurrentEntitlement | null
  entitlementState: EntitlementState
  lastError: string | null
  signIn: (body: LoginRequest) => Promise<AuthResponse>
  signUp: (body: RegisterRestaurantRequest) => Promise<AuthResponse>
  refreshSession: () => Promise<AuthResponse>
  bootstrap: () => Promise<void>
  loadEntitlement: () => Promise<void>
  revalidateAccess: () => Promise<void>
  signOut: () => Promise<void>
  clearSession: () => void
}

const applyAuthResponse = (response: AuthResponse) => {
  setAccessToken(response.accessToken)
  sessionHint.mark()
  useAuthStore.setState({ status: 'authenticated', user: response.user, lastError: null })
  if (proactiveTimer) clearTimeout(proactiveTimer)
  proactiveTimer = setTimeout(
    () => {
      void refreshWithCoordinator().catch(() => undefined)
    },
    Math.max(1_000, (response.expiresIn - 60) * 1_000),
  )
}

const REFRESH_LOCK = 'xaypos-auth-refresh'
let proactiveTimer: ReturnType<typeof setTimeout> | null = null
let bootstrapPromise: Promise<void> | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  sessionRevision: 0,
  status: 'bootstrapping',
  user: null,
  entitlement: null,
  entitlementState: 'idle',
  lastError: null,
  signIn: async (body) => {
    const response = await authApi.login({
      ...body,
      email: body.email.trim().toLowerCase(),
      deviceInfo: getDeviceInfo(),
    })
    set({ sessionRevision: get().sessionRevision + 1 })
    applyAuthResponse(response)
    await get().loadEntitlement()
    return response
  },
  signUp: async (body) => {
    const response = await authApi.registerRestaurant(body)
    set({ sessionRevision: get().sessionRevision + 1 })
    applyAuthResponse(response)
    await get().loadEntitlement()
    return response
  },
  refreshSession: async () => {
    const revision = get().sessionRevision
    try {
      const response = await withCrossTabLock(REFRESH_LOCK, () => authApi.refresh())
      if (revision !== get().sessionRevision) throw new Error('ORDER_ACCESS_CHANGED')
      applyAuthResponse(response)
      await get().loadEntitlement()
      return response
    } catch (error) {
      if (revision === get().sessionRevision) get().clearSession()
      throw error
    }
  },
  bootstrap: async () => {
    if (bootstrapPromise) return bootstrapPromise
    const revision = get().sessionRevision
    bootstrapPromise = (async () => {
      set({ status: 'bootstrapping', lastError: null })
      if (!sessionHint.present()) {
        set({ status: 'unauthenticated' })
        return
      }
      try {
        await refreshWithCoordinator()
      } catch (error) {
        if (get().sessionRevision === revision || get().status === 'unauthenticated')
          set({ status: 'unauthenticated', lastError: normalizeApiError(error).message })
      }
    })()
    try {
      await bootstrapPromise
    } finally {
      bootstrapPromise = null
    }
  },
  loadEntitlement: async () => {
    const user = get().user
    const revision = get().sessionRevision
    if (!user || user.role === 'SUPER_ADMIN' || user.restaurantId === null) {
      set({ entitlement: null, entitlementState: 'idle' })
      return
    }
    if (!get().entitlement) set({ entitlementState: 'loading' })
    try {
      const entitlement = await authApi.entitlements()
      if (revision !== get().sessionRevision || user.id !== get().user?.id) return
      set({ entitlement, entitlementState: entitlement.status === 'ACTIVE' ? 'active' : 'inactive' })
    } catch (error) {
      if (revision !== get().sessionRevision || user.id !== get().user?.id) return
      const code = errorCode(error)
      if (code === 'SUBSCRIPTION_NOT_ACTIVE') set({ entitlement: null, entitlementState: 'inactive' })
      else if (
        get().entitlement &&
        (normalizeApiError(error).isNetworkError || (normalizeApiError(error).status ?? 0) >= 500)
      )
        set({ lastError: normalizeApiError(error).message })
      else set({ entitlement: null, entitlementState: 'error', lastError: normalizeApiError(error).message })
    }
  },
  revalidateAccess: async () => {
    const revision = get().sessionRevision
    const user = get().user
    if (!user?.restaurantId || user.role === 'SUPER_ADMIN') return
    const [currentUser, entitlement] = await Promise.all([authApi.me(), authApi.entitlements()])
    if (revision !== get().sessionRevision || user.id !== get().user?.id) return
    set({ user: currentUser, entitlement, entitlementState: entitlement.status === 'ACTIVE' ? 'active' : 'inactive' })
  },
  signOut: async () => {
    try {
      // The cookie proves the session, so logout also works after the access token expired.
      if (sessionHint.present()) await authApi.logout()
    } catch {
      /* Local logout must still complete when the server is unavailable. */
    } finally {
      get().clearSession()
    }
  },
  clearSession: () => {
    if (proactiveTimer) clearTimeout(proactiveTimer)
    proactiveTimer = null
    set({ sessionRevision: get().sessionRevision + 1 })
    setAccessToken(null)
    sessionHint.clear()
    resetRefreshCoordinator()
    queryClient.clear()
    set({ status: 'unauthenticated', user: null, entitlement: null, entitlementState: 'idle', lastError: null })
  },
}))

function getDeviceInfo() {
  const value = `${navigator.userAgent} / ${navigator.platform}`
  return value.slice(0, 255)
}
