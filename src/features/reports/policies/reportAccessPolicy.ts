import { hasFeature, hasPermission, type TenantAccess } from '../../../shared/access/tenantAccess'

/**
 * Report access is permission × package feature (report-fe-sync.md: "do not
 * hardcode OWNER, CASHIER, BASIC or PRO"). Ports AccessPolicy.canDailyReport,
 * canDetailReport and canViewReferenceMarginReports of the app.
 */
export const canDailyReport = (a: TenantAccess) => hasFeature(a, 'DAILY_REVENUE') && hasPermission(a, 'REPORT_DAILY_VIEW')
export const canDetailReport = (a: TenantAccess) => hasFeature(a, 'DETAIL_REPORT') && hasPermission(a, 'REPORT_DETAIL_VIEW')
export const canReferenceMargin = (a: TenantAccess) =>
  canDetailReport(a) && hasFeature(a, 'ORDER_MANAGEMENT') && hasPermission(a, 'ORDER_VIEW')
