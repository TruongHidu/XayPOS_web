import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useQrGuestAccess } from './useQrGuestAccess'
import { publicQrOrderApi } from '../api/publicQrOrderApi'
import { publicQrOrderKeys } from '../api/publicQrOrderKeys'
import { resourceId } from '../../../shared/api/tenantSchemas'
import { receiptNeedsPolling } from '../policies/qrOrderPolicy'
import { qrOrderError, QrOrderError } from '../utils/qrOrderErrors'
import { useQrGuestStore } from '../store/qrOrderGuestStore'
import { useQrEntry } from './useQrEntry'
export function useQrOrderReceipt(requestId: string) {
  const entry = useQrEntry()
  const access = useQrGuestAccess()
  const failures = useRef(0)
  // Keep the interval stable while the expiry countdown rerenders every second.
  const jitter = useMemo(() => {
    let hash = 0
    for (const char of access.scopeId + requestId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
    return Math.abs(hash) % 500
  }, [access.scopeId, requestId])
  useEffect(() => {
    failures.current = 0
  }, [access.scopeId, requestId])
  const [visible, setVisible] = useState(() => !document.hidden && navigator.onLine)
  useEffect(() => {
    const update = () => setVisible(!document.hidden && navigator.onLine)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  const enabled =
    !!access.guest &&
    !access.invalid &&
    !access.unavailable &&
    !access.waitSeconds &&
    visible &&
    resourceId.safeParse(requestId).success &&
    access.entry?.entryType === entry.entryType &&
    access.entry?.token === entry.token
  return useQuery({
    queryKey: publicQrOrderKeys.receipt(access.scopeId, requestId),
    enabled,
    retry: false,
    gcTime: 60 * 60 * 1000,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      const scope = access.scopeId
      try {
        const receipt = await publicQrOrderApi.receipt(access.guest!.guestToken, requestId, signal)
        if (useQrGuestStore.getState().scopeId !== scope || signal.aborted) throw new QrOrderError('QR_SCOPE_CHANGED')
        if (receipt.entryType !== entry.entryType) throw new QrOrderError('INVALID_QR_RESPONSE')
        failures.current = 0
        return receipt
      } catch (error) {
        if (!signal.aborted) failures.current += 1
        if (useQrGuestStore.getState().scopeId === scope && !signal.aborted)
          useQrGuestStore.getState().fail(qrOrderError(error))
        throw error
      }
    },
    refetchInterval: (query) => {
      if (!enabled || !receiptNeedsPolling(query.state.data)) return false
      const failure = query.state.error ? qrOrderError(query.state.error) : null
      if (failure && [400, 401, 403, 404].includes(failure.status ?? 0)) return false
      if (failure?.status === 429) return false
      const base = query.state.data?.status === 'APPROVED' ? 10000 : 5000
      return Math.min(60000, base * 2 ** Math.min(3, failures.current)) + jitter
    },
  })
}
