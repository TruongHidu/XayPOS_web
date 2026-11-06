/**
 * Format a price for display using the restaurant's currency code and vi-VN locale.
 * Uses Intl.NumberFormat to properly format VND (and other currencies).
 */
export function formatMenuPrice(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount)
}
