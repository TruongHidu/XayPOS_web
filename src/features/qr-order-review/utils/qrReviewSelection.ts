import { moneyMinor } from '../../../shared/utils/scaledDecimal'
import type { QrExcludedItem, QrQuoteLine, QrRequestItem } from '../types'

/** Staff choice for one request line: take it into the order, or leave it out with a reason the guest reads. */
export interface LineChoice {
  accept: boolean
  reason: string
}
/** Keyed by `requestItemId`. */
export type Selection = Record<string, LineChoice>

export const REASON_MAX = 500
export const DEFAULT_LEAVE_OUT_REASON = 'Món đã hết'

/** Suggested guest-facing reason for a line the backend marks unavailable. */
export function suggestedReason(unavailableReason: string | null) {
  if (unavailableReason === 'ITEM_NOT_SELLABLE') return 'Món tạm ngưng bán'
  if (unavailableReason === 'MENU_ITEM_NOT_FOUND') return 'Món không còn trong thực đơn'
  return DEFAULT_LEAVE_OUT_REASON
}

/**
 * Choices for the lines of a (re)read review. Unavailable lines are always left
 * out (the backend refuses them); available lines keep what staff chose before
 * the re-read, otherwise they are accepted.
 */
export function initialSelection(lines: QrQuoteLine[], previous: Selection = {}): Selection {
  const next: Selection = {}
  for (const line of lines) {
    const before = previous[line.requestItemId]
    if (!line.available)
      next[line.requestItemId] = {
        accept: false,
        reason:
          before && !before.accept && before.reason.trim() ? before.reason : suggestedReason(line.unavailableReason),
      }
    else next[line.requestItemId] = before ?? { accept: true, reason: '' }
  }
  return next
}

/** Toggle one line; leaving a line out pre-fills a reason staff can edit. */
export function chooseLine(selection: Selection, requestItemId: string, accept: boolean): Selection {
  const before = selection[requestItemId] ?? { accept: true, reason: '' }
  const reason = accept || before.reason.trim() ? before.reason : DEFAULT_LEAVE_OUT_REASON
  return { ...selection, [requestItemId]: { accept, reason } }
}

export function setReason(selection: Selection, requestItemId: string, reason: string): Selection {
  return { ...selection, [requestItemId]: { accept: false, reason } }
}

/** Leave out the lines whose dish is short of stock (`details.lines[].menuItemId` of INSUFFICIENT_AVAILABLE_STOCK). */
export function untickMenuItems(selection: Selection, lines: QrQuoteLine[], menuItemIds: string[]): Selection {
  let next = selection
  for (const line of lines) if (menuItemIds.includes(line.itemId)) next = chooseLine(next, line.requestItemId, false)
  return next
}

export const choiceOf = (selection: Selection, line: QrQuoteLine): LineChoice =>
  line.available
    ? (selection[line.requestItemId] ?? { accept: true, reason: '' })
    : { accept: false, reason: selection[line.requestItemId]?.reason ?? suggestedReason(line.unavailableReason) }

export const acceptedLines = (lines: QrQuoteLine[], selection: Selection) =>
  lines.filter((line) => choiceOf(selection, line).accept)

/** Approve body field: undefined when every line is taken, so the request matches a plain approval. */
export function excludedItemsOf(lines: QrQuoteLine[], selection: Selection): QrExcludedItem[] | undefined {
  const excluded = lines
    .filter((line) => !choiceOf(selection, line).accept)
    .map((line) => ({ requestItemId: line.requestItemId, reason: choiceOf(selection, line).reason.trim() }))
  return excluded.length ? excluded : undefined
}

/** A left-out line still needs a reason for the guest. */
export const missingReason = (lines: QrQuoteLine[], selection: Selection) =>
  (excludedItemsOf(lines, selection) ?? []).some((item) => !item.reason)

/** Sum of the current prices of accepted lines (minor units). */
export const acceptedTotal = (lines: QrQuoteLine[], selection: Selection) =>
  acceptedLines(lines, selection).reduce((total, line) => total + moneyMinor(line.lineTotal ?? 0), 0n)

/** The guest's price for a line differs from today's price. */
export function priceChanged(line: QrQuoteLine, items: QrRequestItem[]) {
  const sent = items.find((item) => item.id === line.requestItemId)
  return !!sent && line.unitPrice !== null && moneyMinor(line.unitPrice) !== moneyMinor(sent.unitPrice) ? sent : null
}
