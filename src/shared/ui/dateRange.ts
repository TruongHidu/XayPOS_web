/** Local calendar dates as `YYYY-MM-DD` (what the report/cashbook APIs take as fromDate/toDate). */
export type IsoDate = string

export interface DateRange {
  from: IsoDate
  to: IsoDate
}

export type DatePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth'

export const datePresetLabels: Record<DatePreset, string> = {
  today: 'Hôm nay',
  yesterday: 'Hôm qua',
  last7: '7 ngày qua',
  last30: '30 ngày qua',
  thisMonth: 'Tháng này',
  lastMonth: 'Tháng trước',
}

const pad = (value: number) => String(value).padStart(2, '0')

export function toIsoDate(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseIsoDate(value: IsoDate): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return toIsoDate(date) === value ? date : null
}

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

export function presetRange(preset: DatePreset, today = new Date()): DateRange {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  switch (preset) {
    case 'today':
      return { from: toIsoDate(base), to: toIsoDate(base) }
    case 'yesterday': {
      const day = addDays(base, -1)
      return { from: toIsoDate(day), to: toIsoDate(day) }
    }
    case 'last7':
      return { from: toIsoDate(addDays(base, -6)), to: toIsoDate(base) }
    case 'last30':
      return { from: toIsoDate(addDays(base, -29)), to: toIsoDate(base) }
    case 'thisMonth':
      return { from: toIsoDate(new Date(base.getFullYear(), base.getMonth(), 1)), to: toIsoDate(base) }
    case 'lastMonth':
      return {
        from: toIsoDate(new Date(base.getFullYear(), base.getMonth() - 1, 1)),
        to: toIsoDate(new Date(base.getFullYear(), base.getMonth(), 0)),
      }
  }
}

export function matchPreset(range: DateRange, today = new Date()): DatePreset | null {
  return (
    (Object.keys(datePresetLabels) as DatePreset[]).find((preset) => {
      const candidate = presetRange(preset, today)
      return candidate.from === range.from && candidate.to === range.to
    }) ?? null
  )
}

/** Number of calendar days in the range, inclusive. */
export function rangeLength(range: DateRange): number {
  const from = parseIsoDate(range.from)
  const to = parseIsoDate(range.to)
  if (!from || !to) return 0
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
}

export function formatIsoDate(value: IsoDate): string {
  const date = parseIsoDate(value)
  return date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : value
}
