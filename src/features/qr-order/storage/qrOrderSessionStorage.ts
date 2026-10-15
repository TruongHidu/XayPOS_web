import { z } from 'zod'
import { env } from '../../../shared/config/env'
import { resourceId, versionSchema } from '../../../shared/api/tenantSchemas'
import { guestAccessSchema, publicEntrySchema, qrKeySchema, qrRequestInputSchema } from '../schemas'
import { validateQrBody } from '../policies/qrOrderPolicy'
import type { PublicEntry } from '../types'
import { publicMenuItemSchema } from '../../qr-menu/schemas'
import { quantityMilli } from '../../../shared/utils/scaledDecimal'

export const qrSessionStoragePrefix = 'pos-saas:qr-session:v1:'
const storedIntentSchema = z
  .object({
    key: qrKeySchema,
    body: qrRequestInputSchema,
    blocked: z.boolean(),
    lines: z
      .array(
        z
          .object({
            id: resourceId,
            item: publicMenuItemSchema,
            quantity: z.string(),
            note: z.string().max(500),
          })
          .strict(),
      )
      .max(20)
      .default([]),
  })
  .strict()
const sessionSchema = z
  .object({
    version: z.literal(1),
    entry: publicEntrySchema,
    guest: guestAccessSchema.nullable(),
    requestIds: z.array(resourceId).max(1000),
    invalid: z.boolean(),
    recovery: storedIntentSchema.nullable(),
    cooldownUntil: versionSchema,
  })
  .strict()
export type StoredQrIntent = z.infer<typeof storedIntentSchema>
export type StoredQrSession = z.infer<typeof sessionSchema>
export const qrSessionStorageKey = (entry: PublicEntry) =>
  qrSessionStoragePrefix + encodeURIComponent(env.apiBaseUrl) + ':' + entry.entryType + ':' + entry.token

function invalidSession(entry: PublicEntry, requestIds: string[] = []): StoredQrSession {
  return { version: 1, entry, guest: null, requestIds, invalid: true, recovery: null, cooldownUntil: 0 }
}
function normalizeSession(session: StoredQrSession): StoredQrSession {
  if (session.invalid || (session.guest && Date.parse(session.guest.expiresAt) <= Date.now()))
    return invalidSession(session.entry, session.requestIds)
  if (session.guest && session.guest.entryType !== session.entry.entryType) throw new Error('QR session mismatch')
  if (session.recovery) {
    if (!session.guest) throw new Error('QR recovery requires original guest')
    session.recovery.body = validateQrBody(session.entry, session.recovery.body)
    if (
      session.recovery.lines.length &&
      (session.recovery.lines.length !== session.recovery.body.items.length ||
        session.recovery.lines.some((line, index) => {
          const requested = session.recovery!.body.items[index]
          return (
            line.item.id !== requested.itemId ||
            quantityMilli(line.quantity) !== quantityMilli(String(requested.quantity)) ||
            (line.note || null) !== (requested.note || null)
          )
        }))
    )
      throw new Error('QR recovery lines do not match the original intent')
    session.recovery.lines = session.recovery.lines.map((line) => ({
      ...line,
      item: { ...line.item, group: null, imageUrl: null, description: null },
    }))
  }
  return session
}
export function readQrSession(entry: PublicEntry): { session: StoredQrSession | null; available: boolean } {
  try {
    const raw = window.sessionStorage.getItem(qrSessionStorageKey(entry))
    if (raw === null) return { session: null, available: true }
    let session: StoredQrSession
    try {
      if (raw.length > 131072) throw new Error('QR session exceeds storage limit')
      session = sessionSchema.parse(JSON.parse(raw))
      if (session.entry.entryType !== entry.entryType || session.entry.token !== entry.token)
        throw new Error('QR entry mismatch')
      session = normalizeSession(session)
    } catch {
      // A damaged record must not silently replace an earlier guest or uncertain submission.
      session = invalidSession(entry)
    }
    const available = writeQrSession(session)
    return { session, available }
  } catch {
    return { session: null, available: false }
  }
}
export function writeQrSession(input: StoredQrSession): boolean {
  try {
    const session = normalizeSession(sessionSchema.parse(input))
    const key = qrSessionStorageKey(session.entry)
    if (!session.guest && !session.invalid) {
      window.sessionStorage.removeItem(key)
      return true
    }
    const serialized = JSON.stringify(session)
    if (serialized.length > 131072) throw new Error('QR session exceeds storage limit')
    window.sessionStorage.setItem(key, serialized)
    return true
  } catch {
    return false
  }
}
export function clearQrSession(entry: PublicEntry): boolean {
  try {
    window.sessionStorage.removeItem(qrSessionStorageKey(entry))
    return true
  } catch {
    return false
  }
}
