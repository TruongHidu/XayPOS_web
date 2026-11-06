export function idempotencyHeaders(key: string) {
  if (!key || key !== key.trim() || key.length > 100 || !/^[\x21-\x7e]+$/.test(key))
    throw new Error('INVALID_IDEMPOTENCY_KEY')
  return { 'Idempotency-Key': key }
}
