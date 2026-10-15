import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchQrMenuItems } from '../api/publicQrMenuApi'
import { qrMenuKeys } from '../api/publicQrMenuKeys'
import type { PublicMenuPage, PublicMenuQuery } from '../types'

/**
 * Fetches paginated menu items for a given QR token and query.
 * Only enabled when context has loaded successfully.
 */
export function usePublicQrMenuItems(
  qrToken: string | undefined,
  query: PublicMenuQuery,
  contextLoaded: boolean,
  entryType: 'TABLE' | 'RESTAURANT' = 'TABLE',
): UseQueryResult<PublicMenuPage> {
  const enabled = Boolean(qrToken && contextLoaded)
  return useQuery({
    queryKey: qrMenuKeys.items(qrToken ?? '', query, entryType),
    queryFn: ({ signal }) => fetchQrMenuItems(qrToken!, query, signal, entryType),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}
