import { z } from 'zod'

/**
 * `details` of a staff 409 INSUFFICIENT_AVAILABLE_STOCK (create, append, QR
 * approve). Nothing was saved: the whole command rolled back.
 * See XayPOS_be/docs/order-inventory-shortage-details-prompt.md.
 */
const shortageSchema = z.object({
  lines: z.array(
    z.object({
      orderItemId: z.string().nullable().optional(),
      menuItemId: z.string().nullable().optional(),
      itemName: z.string(),
      requestedQuantity: z.number(),
      maxAvailableQuantity: z.number(),
      unit: z.string(),
      sharesIngredientWithOtherLines: z.boolean().optional(),
      shortIngredients: z
        .array(z.object({ ingredientId: z.string(), name: z.string(), unit: z.string(), availableQuantity: z.number(), requiredQuantity: z.number() }))
        .nullable()
        .optional(),
    }),
  ),
})

export type ShortageVerdict = 'reduce' | 'soldOut' | 'unknown'
export interface ShortageDish {
  key: string
  name: string
  unit: string
  requested: number
  verdict: ShortageVerdict
  canMake?: number
  sharesIngredients: boolean
  ingredients: Array<{ name: string; unit: string; available: number; required: number }>
}

/** Reads the shortage details from an API error, or null when the error is something else. */
export function stockShortageOf(error: unknown): ShortageDish[] | null {
  const data = (error as { response?: { status?: number; data?: { code?: string; details?: unknown } } })?.response?.data
  if (data?.code !== 'INSUFFICIENT_AVAILABLE_STOCK') return null
  const parsed = shortageSchema.safeParse(data.details)
  if (!parsed.success || parsed.data.lines.length === 0) return null

  // Group refused lines by dish, in the order they were sent.
  const groups = new Map<string, z.infer<typeof shortageSchema>['lines']>()
  for (const line of parsed.data.lines) {
    const key = line.menuItemId ?? `${line.itemName}\u0000${line.unit}`
    groups.set(key, [...(groups.get(key) ?? []), line])
  }
  return [...groups.entries()].map(([key, lines]) => {
    const requested = round3(lines.reduce((sum, line) => sum + line.requestedQuantity, 0))
    // The server's per-line maximum holds every other line still, so the dish can make
    // that maximum plus its other lines. A zero maximum says nothing about capacity.
    const capacities = lines
      .filter((line) => line.maxAvailableQuantity > 0)
      .map((line) => line.maxAvailableQuantity + (requested - line.requestedQuantity))
    const sharesIngredients = lines.some((line) => line.sharesIngredientWithOtherLines)
    const ingredients = new Map<string, ShortageDish['ingredients'][number]>()
    for (const line of lines)
      for (const short of line.shortIngredients ?? [])
        ingredients.set(short.ingredientId, { name: short.name, unit: short.unit, available: short.availableQuantity, required: short.requiredQuantity })
    const canMake = capacities.length ? round3(Math.min(requested, ...capacities)) : undefined
    return {
      key,
      name: lines[0].itemName,
      unit: lines[0].unit,
      requested,
      verdict: canMake !== undefined && canMake > 0 ? 'reduce' : sharesIngredients ? 'unknown' : 'soldOut',
      canMake,
      sharesIngredients,
      ingredients: [...ingredients.values()],
    }
  })
}

const round3 = (value: number) => Math.round(value * 1000) / 1000
export const fmtQty = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 3 })
