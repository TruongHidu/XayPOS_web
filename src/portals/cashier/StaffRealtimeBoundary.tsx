import { useEffect, useState, type PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../features/auth/store/authStore'
import { orderScope } from '../../features/order/policies/orderAccessPolicy'
import { orderKeys } from '../../features/order/api/orderKeys'
import { invalidateOrderEvent, resyncOrders } from '../../features/order/realtime/orderAdapter'
import { invalidateQrEvent, invalidateReviewContext } from '../../features/qr-order-review/realtime/qrReviewAdapter'
import { qrReviewKeys } from '../../features/qr-order-review/api/qrReviewKeys'
import { invalidateKitchenEvent } from '../../features/kitchen/realtime/kitchenAdapter'
import { operationKey, useOrderOperationState } from '../../features/order/store/orderOperationState'
import { getAccessToken, refreshWithCoordinator, subscribeAccessToken } from '../../shared/api/httpClient'
import { env } from '../../shared/config/env'
import { allowedChannels, type Channel } from '../../shared/realtime/channelPolicy'
import { EventCache } from '../../shared/realtime/eventCache'
import { QueryInvalidator } from '../../shared/realtime/queryInvalidator'
import { RealtimeContext, type RealtimeStatus } from '../../shared/realtime/RealtimeContext'
import { RealtimeRuntime } from '../../shared/realtime/runtime'
import { realtimeUrl } from '../../shared/realtime/url'
import { staffRealtimeRuntime } from './staffRealtimeRuntime'

export function StaffRealtimeBoundary({
  children,
  runtime = staffRealtimeRuntime,
  enabled = env.realtimeEnabled,
}: PropsWithChildren<{ runtime?: RealtimeRuntime; enabled?: boolean }>) {
  const client = useQueryClient()
  const [configuration] = useState(() => {
    try {
      return { url: realtimeUrl(env.apiBaseUrl, env.realtimeUrl) }
    } catch {
      return { url: undefined }
    }
  })
  const [status, setStatus] = useState<RealtimeStatus>({
    state: !enabled ? 'disabled' : configuration.url ? 'disconnected' : 'blocked',
    code: configuration.url ? undefined : 'REALTIME_INVALID_URL',
  })
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!enabled || !configuration.url) return
    const url = configuration.url
    let disposed = false
    let identity = ''
    let scope: string | null = null
    let token = getAccessToken()
    let invalidator: QueryInvalidator | undefined
    let caches = new Map<Channel, EventCache>()
    let notificationCache = new EventCache()
    let noticeTimer: ReturnType<typeof setTimeout> | undefined
    let revalidation: Promise<void> | undefined
    let lastRevalidation = -Infinity
    let hiddenAt = 0
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined
    const revalidate = () => {
      if (disposed || revalidation || Date.now() - lastRevalidation < 30000) return
      lastRevalidation = Date.now()
      revalidation = useAuthStore
        .getState()
        .revalidateAccess()
        .catch(() => undefined)
        .finally(() => {
          revalidation = undefined
        })
    }
    const consumerChannels = () =>
      allowedChannels(useAuthStore.getState(), {
        orders: true,
        qr: true, // Backlog notification is a real consumer throughout Cashier Web.
        kitchen: client
          .getQueryCache()
          .findAll({ queryKey: orderKeys.kitchens(scope) })
          .some((query) => query.isActive()),
        inventory: false,
      })
    const sync = () => {
      if (disposed) return
      const auth = useAuthStore.getState()
      const nextScope = auth.status === 'authenticated' && auth.entitlementState === 'active' ? orderScope(auth) : null
      const next = nextScope ? `${auth.sessionRevision}:${nextScope}` : ''
      if (next !== identity) {
        runtime.stop()
        invalidator?.dispose()
        caches.forEach((cache) => cache.clear())
        caches = new Map()
        notificationCache = new EventCache()
        if (noticeTimer) clearTimeout(noticeTimer)
        setNotice('')
        identity = next
        scope = nextScope
        token = getAccessToken()
        if (!scope) {
          setStatus({ state: 'disconnected' })
          return
        }
        const capturedScope = scope
        const capturedIdentity = identity
        const current = () => !disposed && identity === capturedIdentity
        invalidator = new QueryInvalidator(
          client,
          (query) =>
            query.queryKey[0] === 'cashier' &&
            query.queryKey[1] === capturedScope &&
            ['orders', 'order', 'tables', 'active-order', 'session', 'selected-table', 'qr-review', 'kitchen'].includes(
              String(query.queryKey[2]),
            ),
          (query) => {
            if (query.queryKey[2] !== 'order') return false
            const state = useOrderOperationState.getState()
            const key = operationKey(capturedScope, String(query.queryKey[3]))
            return state.busy.has(key) || state.uncertain.has(key) || state.refusals.has(key)
          },
        )
        const batch = invalidator
        runtime.start({
          url,
          channels: consumerChannels(),
          getToken: getAccessToken,
          refresh: refreshWithCoordinator,
          onStatus: (nextStatus) => {
            if (current()) setStatus(nextStatus)
          },
          onAccessFailure: revalidate,
          onConnected: () => {
            if (!current()) return
            const allowed = consumerChannels()
            if (allowed.includes('orders')) resyncOrders(batch, client, capturedScope)
            if (allowed.includes('qr')) batch.invalidate(qrReviewKeys.root(capturedScope))
            if (allowed.includes('kitchen')) batch.invalidate(orderKeys.kitchens(capturedScope))
          },
          onEvent: (channel, event) => {
            if (!current() || !consumerChannels().includes(channel)) return
            let cache = caches.get(channel)
            if (!cache) {
              cache = new EventCache()
              caches.set(channel, cache)
            }
            if (!cache.accept(event.eventId)) return
            if (channel === 'orders' && event.type === 'ORDER_CHANGED') {
              invalidateOrderEvent(batch, capturedScope, event)
              invalidateReviewContext(batch, client, capturedScope, event)
            }
            if (channel === 'kitchen' && event.type === 'ORDER_CHANGED')
              invalidateKitchenEvent(batch, capturedScope, event)
            if (channel === 'qr' && event.type === 'QR_ORDER_REQUEST_CHANGED') {
              invalidateQrEvent(batch, capturedScope, event)
              if (
                event.payload.changeKind === 'CREATED' &&
                event.payload.status === 'PENDING' &&
                notificationCache.accept(event.eventId)
              ) {
                setNotice('Có yêu cầu gọi món QR mới đang chờ duyệt.')
                if (noticeTimer) clearTimeout(noticeTimer)
                noticeTimer = setTimeout(() => {
                  if (current()) setNotice('')
                }, 6000)
              }
            }
          },
        })
        runtime.setOnline(navigator.onLine)
      } else {
        runtime.setChannels(consumerChannels())
        const nextToken = getAccessToken()
        if (nextToken !== token) {
          token = nextToken
          runtime.tokenChanged()
        }
      }
    }
    sync()
    const authSubscription = useAuthStore.subscribe(sync)
    const tokenSubscription = subscribeAccessToken(sync)
    const querySubscription = client.getQueryCache().subscribe((event) => {
      if (event.query.queryKey[0] !== 'cashier' || event.query.queryKey[1] !== scope) return
      if (event.query.queryKey[2] === 'kitchen') runtime.setChannels(consumerChannels())
      if (event.type === 'updated' && event.query.state.status === 'error') {
        const failure = event.query.state.error as { response?: { status?: number }; status?: number }
        if ([401, 403].includes(failure?.status ?? failure?.response?.status ?? 0)) revalidate()
      }
    })
    const operationSubscription = useOrderOperationState.subscribe(() => invalidator?.wake())
    const online = () => runtime.setOnline(true)
    const offline = () => runtime.setOnline(false)
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        hiddenTimer = setTimeout(() => runtime.setOnline(false), 120000)
      } else {
        if (hiddenTimer) clearTimeout(hiddenTimer)
        runtime.setOnline(navigator.onLine)
        runtime.resume(Date.now() - hiddenAt > 30000)
      }
    }
    const pagehide = () => {
      runtime.stop()
      identity = ''
      invalidator?.dispose()
    }
    const pageshow = () => {
      sync()
      runtime.resume()
    }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    window.addEventListener('pagehide', pagehide)
    window.addEventListener('pageshow', pageshow)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      disposed = true
      runtime.stop()
      invalidator?.dispose()
      authSubscription()
      tokenSubscription()
      querySubscription()
      operationSubscription()
      caches.forEach((cache) => cache.clear())
      notificationCache.clear()
      if (noticeTimer) clearTimeout(noticeTimer)
      if (hiddenTimer) clearTimeout(hiddenTimer)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      window.removeEventListener('pagehide', pagehide)
      window.removeEventListener('pageshow', pageshow)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [client, runtime, enabled, configuration])
  return (
    <RealtimeContext.Provider value={enabled ? { ...status, retry: () => runtime.retry() } : { state: 'disabled' }}>
      {enabled && notice && (
        <div className="staff-realtime-notice" role="status">
          {notice}
        </div>
      )}
      {children}
    </RealtimeContext.Provider>
  )
}
