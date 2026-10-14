import type { z } from 'zod'
import { api } from '../../../shared/api/httpClient'
import { tenantRequest } from '../../../shared/api/tenantRequest'
import { ensureRequestScope } from '../../../shared/api/requestScope'
import { parseTenantResponse } from '../../../shared/api/parseTenantResponse'
import { kitchenCriteriaSchema, kitchenPageSchema } from '../schemas'

export const kitchenApi = {
  async items(scope: string, criteria: z.input<typeof kitchenCriteriaSchema> = {}, signal?: AbortSignal) {
    const params = kitchenCriteriaSchema.parse(criteria)
    const config = tenantRequest(scope, signal)
    const response = await api.get<unknown>('/kitchen/items', { ...config, params })
    ensureRequestScope(config)
    return parseTenantResponse(kitchenPageSchema, response.data, 'INVALID_KITCHEN_RESPONSE')
  },
}
