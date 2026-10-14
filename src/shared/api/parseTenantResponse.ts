import type { z } from 'zod'
export function parseTenantResponse<T>(schema: z.ZodType<T>, value: unknown, code = 'INVALID_TENANT_RESPONSE'): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new Error(code)
  return result.data
}
