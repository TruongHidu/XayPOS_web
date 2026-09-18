import { api } from '../../../shared/api/httpClient'
import type { PageResponse } from '../../../shared/types/auth'
import type { AuditLogCriteria, AuditLogResponse } from '../../../shared/types/admin'

export const auditApi = { list: (criteria: AuditLogCriteria) => api.get<PageResponse<AuditLogResponse>>('/admin/audit-logs', { params: compactCriteria(criteria) }).then((response) => response.data) }
function compactCriteria(criteria: AuditLogCriteria) { return Object.fromEntries(Object.entries(criteria).filter(([, value]) => value !== '')) }
