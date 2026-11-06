import { parseTenantResponse } from '../../../shared/api/parseTenantResponse'
import { api } from '../../../shared/api/httpClient'
import { ensureRequestScope } from '../../../shared/api/requestScope'
import { tenantRequest as orderRequest } from '../../../shared/api/tenantRequest'
import { menuGroupPageSchema, privateMenuPageSchema } from '../schemas'
export interface MenuCriteria {
  q: string
  groupId?: string
  page: number
}
export const privateMenuApi = {
  async items(scope: string, criteria: MenuCriteria, signal?: AbortSignal) {
    const config = orderRequest(scope, signal)
    const response = await api.get<unknown>('/menu/items', {
      ...config,
      params: {
        ...criteria,
        size: 20,
        active: true,
        sellable: true,
        availabilityStatus: 'AVAILABLE',
        sortBy: 'name',
        direction: 'asc',
      },
    })
    ensureRequestScope(config)
    return parseTenantResponse(privateMenuPageSchema, response.data)
  },
  async groups(scope: string, page: number, signal?: AbortSignal) {
    const config = orderRequest(scope, signal)
    const response = await api.get<unknown>('/menu/groups', {
      ...config,
      params: { page, size: 20, active: true, sortBy: 'displayOrder', direction: 'asc' },
    })
    ensureRequestScope(config)
    return parseTenantResponse(menuGroupPageSchema, response.data)
  },
}
