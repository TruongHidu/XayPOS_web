import { api } from '../../../shared/api/httpClient'
import type { DashboardSummary } from '../../../shared/types/admin'
import type { AdminRevenue } from '../../../shared/types/adminPayments'

export const adminDashboardApi = {
  summary: () => api.get<DashboardSummary>('/admin/dashboard/summary').then((response) => response.data),
  revenue: (months = 12) => api.get<AdminRevenue>('/admin/dashboard/revenue', { params: { months } }).then((response) => response.data),
}
