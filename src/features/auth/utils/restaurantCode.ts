const SUFFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MAX_BASE_LENGTH = 40

function randomSuffix(length = 6) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (value) => SUFFIX_ALPHABET[value % SUFFIX_ALPHABET.length]).join('')
}

/** Internal tenant code; owners sign in by email and never need to remember it. */
export function generateRestaurantCode(restaurantName: string) {
  const base = restaurantName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .slice(0, MAX_BASE_LENGTH)
    .replace(/^_+|_+$/g, '')
  return `${base || 'NHAHANG'}_${randomSuffix()}`
}
