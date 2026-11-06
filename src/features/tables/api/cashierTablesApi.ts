import { parseTenantResponse } from '../../../shared/api/parseTenantResponse'
import { api } from '../../../shared/api/httpClient'
import { ensureRequestScope } from '../../../shared/api/requestScope'
import { tenantRequest as orderRequest } from '../../../shared/api/tenantRequest'
import { areaPageSchema, openSessionSchema, sessionSchema, tablePageSchema, tableSchema } from '../schemas'
import { versionSchema } from '../../../shared/api/tenantSchemas'
export interface TableCriteria {
  occupied?: boolean
  areaId?: string
  page: number
}
async function get(scope: string, url: string, params?: object, signal?: AbortSignal) {
  const config = orderRequest(scope, signal)
  const response = await api.get<unknown>(url, { ...config, params })
  ensureRequestScope(config)
  return response
}
export const cashierTablesApi = {
  areas: async (scope: string, page: number, signal?: AbortSignal) =>
    parseTenantResponse(
      areaPageSchema,
      (
        await get(
          scope,
          '/table-areas',
          { page, size: 20, active: true, sortBy: 'displayOrder', direction: 'asc' },
          signal,
        )
      ).data,
    ),
  tables: async (scope: string, criteria: TableCriteria, signal?: AbortSignal) =>
    parseTenantResponse(
      tablePageSchema,
      (
        await get(
          scope,
          '/tables',
          { ...criteria, size: 20, status: 'AVAILABLE', sortBy: 'displayOrder', direction: 'asc' },
          signal,
        )
      ).data,
    ),
  table: async (scope: string, id: string, signal?: AbortSignal) =>
    parseTenantResponse(tableSchema, (await get(scope, '/tables/' + encodeURIComponent(id), undefined, signal)).data),
  session: async (scope: string, id: string, signal?: AbortSignal) =>
    parseTenantResponse(
      sessionSchema,
      (await get(scope, '/table-sessions/' + encodeURIComponent(id), undefined, signal)).data,
    ),
  async current(scope: string, id: string) {
    const response = await get(scope, '/tables/' + encodeURIComponent(id) + '/current-session')
    return response.status === 204 ? null : parseTenantResponse(sessionSchema, response.data)
  },
  async open(scope: string, id: string, input: { expectedVersion: number; guestCount: number; note?: string }) {
    const config = orderRequest(scope)
    const response = await api.post(
      '/tables/' + encodeURIComponent(id) + '/sessions',
      openSessionSchema.parse(input),
      config,
    )
    ensureRequestScope(config)
    return parseTenantResponse(sessionSchema, response.data)
  },
  async close(scope: string, id: string, expectedVersion: number) {
    const data = { expectedVersion: versionSchema.parse(expectedVersion) }
    const config = orderRequest(scope)
    const response = await api.post('/table-sessions/' + encodeURIComponent(id) + '/close', data, config)
    ensureRequestScope(config)
    return parseTenantResponse(sessionSchema, response.data)
  },
}
