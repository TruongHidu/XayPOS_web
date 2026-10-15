import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchQrMenuContext } from '../api/publicQrMenuApi'
import { qrMenuKeys } from '../api/publicQrMenuKeys'
import type { PublicQrMenuContext } from '../types'

/**
 * Fetches the QR menu context (restaurant, table, groups) for a given token.
 * Only enabled when the token passes the format check.
 */
export function usePublicQrMenuContext(
  qrToken: string | undefined,
  entryType: 'TABLE' | 'RESTAURANT' = 'TABLE',
): UseQueryResult<PublicQrMenuContext> {
  const enabled = Boolean(qrToken && /^[A-Za-z0-9_-]{43}$/.test(qrToken))
  return useQuery({
    queryKey: qrMenuKeys.context(qrToken ?? '', entryType),
    queryFn: ({ signal }) => fetchQrMenuContext(qrToken!, signal, entryType),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}
