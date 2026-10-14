/** Exact decimal arithmetic. Numbers are accepted only at JSON boundaries. */
export function scaledDecimal(value: string | number, scale: number, wholeDigits: number): bigint {
  const text = String(value).trim()
  if (!new RegExp('^\\d{1,' + wholeDigits + '}(?:\\.\\d{1,' + scale + '})?$').test(text)) {
    throw new Error('INVALID_DECIMAL')
  }
  const [whole, fraction = ''] = text.split('.')
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'))
}
export const moneyMinor = (value: string | number) => scaledDecimal(value, 2, 12)
export function quantityMilli(value: string | number): bigint {
  const result = scaledDecimal(value, 3, 9)
  if (result <= 0n) throw new Error('INVALID_QUANTITY')
  return result
}
export function previewLine(price: number, quantity: string): bigint {
  return (moneyMinor(price) * quantityMilli(quantity) + 500n) / 1000n
}
export function formatMinor(minor: bigint, currency?: string) {
  const whole = (minor / 100n).toLocaleString('vi-VN')
  const fraction = (minor % 100n).toString().padStart(2, '0')
  return whole + (fraction === '00' ? '' : ',' + fraction) + (currency ? ' ' + currency : '')
}
