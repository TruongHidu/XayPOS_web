export { shortVnd } from '../../../shared/utils/compactMoney'

/** "2026-11" → "T11/26". */
export function monthLabel(month: string) {
  const [year, m] = month.split('-')
  return `T${Number(m)}/${year.slice(2)}`
}

/** Smallest 1/2/2.5/5 × 10^n that is ≥ value, so the axis ends on a round number. */
export function niceMax(value: number) {
  if (value <= 0) return 1_000_000
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10
  return step * magnitude
}
