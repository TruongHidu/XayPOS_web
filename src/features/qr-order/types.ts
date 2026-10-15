import type { z } from 'zod'
import type { guestAccessSchema, publicEntrySchema, qrReceiptSchema, qrRequestInputSchema } from './schemas'
export type PublicEntry = z.infer<typeof publicEntrySchema>
export type GuestAccess = z.infer<typeof guestAccessSchema>
export type QrReceipt = z.infer<typeof qrReceiptSchema>
export type QrRequestInput = z.infer<typeof qrRequestInputSchema>
export interface QrOrderFailure {
  code: string
  message: string
  fieldErrors: Record<string, string>
  status?: number
  retryAt?: number
  unknownOutcome: boolean
}
