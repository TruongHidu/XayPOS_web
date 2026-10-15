import type { z } from 'zod'
import { publicApi } from '../../../shared/api/publicHttpClient'
import { guestAccessSchema, guestTokenSchema, publicEntrySchema, qrKeySchema, qrReceiptSchema } from '../schemas'
import { resourceId } from '../../../shared/api/tenantSchemas'
import { validateQrBody } from '../policies/qrOrderPolicy'
import { QrOrderError } from '../utils/qrOrderErrors'
import type { PublicEntry, QrRequestInput } from '../types'
const parse = <T extends z.ZodType>(schema: T, data: unknown): z.output<T> => {
  const result = schema.safeParse(data)
  if (!result.success) throw new QrOrderError('INVALID_QR_RESPONSE')
  return result.data
}
export const publicQrOrderApi = {
  async guest(entry: PublicEntry, signal?: AbortSignal) {
    publicEntrySchema.parse(entry)
    const namespace = entry.entryType === 'TABLE' ? 'tables' : 'restaurants'
    const response = await publicApi.post(
      `/public/qr-order/${namespace}/${encodeURIComponent(entry.token)}/guest-access`,
      {},
      { signal },
    )
    const guest = parse(guestAccessSchema, response.data)
    if (guest.entryType !== entry.entryType) throw new QrOrderError('INVALID_QR_RESPONSE')
    return guest
  },
  async submit(entry: PublicEntry, guestToken: string, input: QrRequestInput, key: string, signal?: AbortSignal) {
    publicEntrySchema.parse(entry)
    const body = validateQrBody(entry, input)
    const response = await publicApi.post('/public/qr-order/requests', body, {
      signal,
      headers: { 'X-QR-Guest-Token': guestTokenSchema.parse(guestToken), 'Idempotency-Key': qrKeySchema.parse(key) },
    })
    const receipt = parse(qrReceiptSchema, response.data)
    if (receipt.entryType !== entry.entryType) throw new QrOrderError('INVALID_QR_RESPONSE')
    return { receipt, replayed: response.headers['idempotency-replayed'] === 'true' }
  },
  async receipt(guestToken: string, requestId: string, signal?: AbortSignal) {
    const id = resourceId.parse(requestId)
    const response = await publicApi.get(`/public/qr-order/requests/${encodeURIComponent(id)}`, {
      signal,
      headers: { 'X-QR-Guest-Token': guestTokenSchema.parse(guestToken) },
    })
    const receipt = parse(qrReceiptSchema, response.data)
    if (receipt.requestId !== id) throw new QrOrderError('INVALID_QR_RESPONSE')
    return receipt
  },
}
