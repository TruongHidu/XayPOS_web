import { z } from 'zod'
import { enc, tenantGet } from '../../../shared/api/tenantApi'
import { moneySchema, resourceId, versionSchema } from '../../../shared/api/tenantSchemas'
import { orderKeys } from '../../order/api/orderKeys'

/** GET /orders/{id}/transfer-qr: what the customer should transfer (display only, records nothing). */
export const transferQrSchema = z.object({
  orderId: resourceId,
  orderVersion: versionSchema,
  amount: moneySchema,
  currencyCode: z.string(),
  bankBin: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
  transferContent: z.string(),
  qrPayload: z.string().min(1),
})
export type TransferQr = z.infer<typeof transferQrSchema>

export const transferQrKey = (scope: string | null, orderId: string, version: number) =>
  [...orderKeys.root(scope), 'transfer-qr', orderId.toLowerCase(), version] as const

export const transferQrApi = {
  get: (scope: string, orderId: string, signal?: AbortSignal) =>
    tenantGet(scope, `/orders/${enc(orderId)}/transfer-qr`, transferQrSchema, { signal, code: 'INVALID_PAYMENT_RESPONSE' }),
}
