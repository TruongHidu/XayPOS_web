import type { PublicMenuQuery } from '../types'

/** Query key factory for public QR menu queries. */
export const qrMenuKeys = {
  all: ['qr-menu'] as const,
  context: (qrToken: string) => ['qr-menu', 'context', qrToken] as const,
  items: (qrToken: string, query: PublicMenuQuery) =>
    ['qr-menu', 'items', qrToken, query.q ?? '', query.groupId ?? '', query.page, query.size, query.sortBy, query.direction] as const,
}
