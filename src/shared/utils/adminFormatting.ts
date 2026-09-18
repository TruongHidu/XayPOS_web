export const formatMoney = (amount: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
export const formatDateTime = (value: string | null) => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date) }
export const toUtcIso = (localValue: string) => new Date(localValue).toISOString()
export const toDateTimeLocal = (iso: string) => {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
export const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
