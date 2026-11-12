/** Compact VND for chart axes: 1,2 tr / 350 N / 1,5 tỷ. */
export function shortVnd(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`
  if (value >= 1_000) return `${(value / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} N`
  return value.toLocaleString('vi-VN')
}

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
