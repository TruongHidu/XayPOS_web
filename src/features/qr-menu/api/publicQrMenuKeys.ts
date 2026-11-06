import type { PublicMenuQuery } from '../types'

/** Query key factory for public QR menu queries. */
export const qrMenuKeys = {
  all: ['qr-menu'] as const,
  entry: (token: string, type: 'TABLE' | 'RESTAURANT' = 'TABLE') => ['qr-menu', type, token] as const,
  context: (qrToken: string, type: 'TABLE' | 'RESTAURANT' = 'TABLE') => ['qr-menu', type, qrToken, 'context'] as const,
  items: (qrToken: string, query: PublicMenuQuery, type: 'TABLE' | 'RESTAURANT' = 'TABLE') =>
    [
      'qr-menu',
      type,
      qrToken,
      'items',
      query.q ?? '',
      query.groupId ?? '',
      query.page,
      query.size,
      query.sortBy,
      query.direction,
    ] as const,
}
