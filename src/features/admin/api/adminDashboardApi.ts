import { api } from '../../../shared/api/httpClient'
import type { DashboardSummary } from '../../../shared/types/admin'

export const adminDashboardApi = { summary: () => api.get<DashboardSummary>('/admin/dashboard/summary').then((response) => response.data) }
