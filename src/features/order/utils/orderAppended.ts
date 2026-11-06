import type { Order, OrderLine } from '../types'

const STORAGE_PREFIX = 'pos_appended_lines_'

/**
 * Record appended line IDs for a specific order in localStorage and memory.
 */
export function recordAppendedLines(orderId: string, lineIds: string[]): void {
  if (!orderId || !lineIds.length) return
  try {
    const key = STORAGE_PREFIX + orderId
    const existing = JSON.parse(localStorage.getItem(key) || '[]') as string[]
    const merged = Array.from(new Set([...existing, ...lineIds]))
    localStorage.setItem(key, JSON.stringify(merged))
  } catch {
    // Ignore storage issues in test/restricted environment
  }
}

/**
 * Get locally tracked appended line IDs for an order.
 */
export function getTrackedAppendedLineIds(orderId: string): Set<string> {
  try {
    const key = STORAGE_PREFIX + orderId
    const stored = JSON.parse(localStorage.getItem(key) || '[]') as string[]
    return new Set(stored)
  } catch {
    return new Set()
  }
}

/**
 * Checks whether an order line is an additional item ("món gọi thêm").
 *
 * An item is determined to be appended if:
 * 1. Its ID is in tracked appended line IDs (recorded during append mutations).
 * 2. Its `sentToKitchenAt` is more than 3000ms after the initial order baseline (`order.confirmedAt` or `order.createdAt`).
 * 3. Its `createdAt` (if present) is more than 3000ms after `order.createdAt`.
 */
export function isLineAppended(order: Order, line: OrderLine): boolean {
  // 1. Check client-side tracked append list
  const tracked = getTrackedAppendedLineIds(order.id)
  if (tracked.has(line.id)) {
    return true
  }

  // 2. Check line createdAt if available from backend
  const lineWithCreatedAt = line as OrderLine & { createdAt?: string }
  if (lineWithCreatedAt.createdAt && order.createdAt) {
    const diff = new Date(lineWithCreatedAt.createdAt).getTime() - new Date(order.createdAt).getTime()
    if (diff > 3000) return true
  }

  // 3. Check sentToKitchenAt compared to order baseline time
  if (line.sentToKitchenAt) {
    const baseTime = order.confirmedAt || order.createdAt
    if (baseTime) {
      const diff = new Date(line.sentToKitchenAt).getTime() - new Date(baseTime).getTime()
      if (diff > 3000) return true
    }
  }

  return false
}
