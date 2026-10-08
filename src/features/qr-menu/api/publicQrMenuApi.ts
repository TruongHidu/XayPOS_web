import { publicApi } from '../../../shared/api/publicHttpClient'
import { publicQrMenuContextSchema, publicMenuPageSchema } from '../schemas'
import type { PublicQrMenuContext, PublicMenuPage, PublicMenuQuery } from '../types'

/**
 * Fetch QR menu context: restaurant info, table info, and menu groups.
 */
export async function fetchQrMenuContext(qrToken: string, signal?: AbortSignal): Promise<PublicQrMenuContext> {
  const response = await publicApi.get(`/public/menu/tables/${encodeURIComponent(qrToken)}`, { signal })
  return publicQrMenuContextSchema.parse(response.data)
}

/**
 * Fetch paginated menu items for a given QR token.
 */
export async function fetchQrMenuItems(qrToken: string, query: PublicMenuQuery, signal?: AbortSignal): Promise<PublicMenuPage> {
  const params: Record<string, string | number> = {
    page: query.page,
    size: query.size,
    sortBy: query.sortBy,
    direction: query.direction,
  }
  if (query.q) params.q = query.q
  if (query.groupId) params.groupId = query.groupId

  const response = await publicApi.get(`/public/menu/tables/${encodeURIComponent(qrToken)}/items`, { params, signal })
  return publicMenuPageSchema.parse(response.data)
}
