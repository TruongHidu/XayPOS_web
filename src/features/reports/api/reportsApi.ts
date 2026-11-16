import { tenantGet } from '../../../shared/api/tenantApi'
import { tenantKeys } from '../../../shared/api/tenantKeys'
import {
  dailyResponseSchema,
  marginOrdersResponseSchema,
  marginSeriesResponseSchema,
  marginSummaryResponseSchema,
  paymentMethodsResponseSchema,
  reportOrdersResponseSchema,
  seriesResponseSchema,
  topItemsResponseSchema,
  type MarginOrdersCriteria,
  type RangeCriteria,
  type ReportOrdersCriteria,
  type TopItemsCriteria,
} from '../schemas'

const CODE = 'INVALID_REPORT_RESPONSE'

/**
 * Report keys include every parameter (dates, filters, page, sort) as the
 * backend asks; responses are `no-store`, so pages refetch on open.
 */
export const reportKeys = {
  root: (scope: string | null) => tenantKeys.module(scope, 'reports'),
  daily: (scope: string | null, date: string) => [...reportKeys.root(scope), 'daily', date] as const,
  summary: (scope: string | null, r: RangeCriteria) => [...reportKeys.root(scope), 'summary', rangeKey(r)] as const,
  series: (scope: string | null, r: RangeCriteria, granularity: string) => [...reportKeys.root(scope), 'series', rangeKey(r), granularity] as const,
  paymentMethods: (scope: string | null, r: RangeCriteria) => [...reportKeys.root(scope), 'payment-methods', rangeKey(r)] as const,
  topItems: (scope: string | null, r: RangeCriteria, c: TopItemsCriteria) => [...reportKeys.root(scope), 'top-items', rangeKey(r), c] as const,
  orders: (scope: string | null, r: RangeCriteria, c: ReportOrdersCriteria) => [...reportKeys.root(scope), 'orders', rangeKey(r), c] as const,
  margin: (scope: string | null) => [...reportKeys.root(scope), 'reference-margin'] as const,
  marginSummary: (scope: string | null, r: RangeCriteria) => [...reportKeys.margin(scope), 'summary', rangeKey(r)] as const,
  marginSeries: (scope: string | null, r: RangeCriteria, granularity: string) => [...reportKeys.margin(scope), 'series', rangeKey(r), granularity] as const,
  marginOrders: (scope: string | null, r: RangeCriteria, c: MarginOrdersCriteria) => [...reportKeys.margin(scope), 'orders', rangeKey(r), c] as const,
}

const rangeKey = (r: RangeCriteria) => ({ from: r.from, to: r.to, serviceType: r.serviceType, sourceChannel: r.sourceChannel })

const rangeParams = (r: RangeCriteria) => ({
  fromDate: r.from,
  toDate: r.to,
  serviceType: r.serviceType || undefined,
  sourceChannel: r.sourceChannel || undefined,
})

export const reportsApi = {
  /** `date` defaults on the server to today in the restaurant timezone. */
  daily: (scope: string, date: string | undefined, signal?: AbortSignal) =>
    tenantGet(scope, '/reports/daily', dailyResponseSchema, { signal, code: CODE, params: { date } }),
  summary: (scope: string, r: RangeCriteria, signal?: AbortSignal) =>
    tenantGet(scope, '/reports/summary', dailyResponseSchema, { signal, code: CODE, params: rangeParams(r) }),
  series: (scope: string, r: RangeCriteria, granularity: 'DAY' | 'MONTH', signal?: AbortSignal) =>
    tenantGet(scope, '/reports/revenue-series', seriesResponseSchema, { signal, code: CODE, params: { ...rangeParams(r), granularity } }),
  paymentMethods: (scope: string, r: RangeCriteria, signal?: AbortSignal) =>
    tenantGet(scope, '/reports/payment-methods', paymentMethodsResponseSchema, { signal, code: CODE, params: rangeParams(r) }),
  topItems: (scope: string, r: RangeCriteria, c: TopItemsCriteria, signal?: AbortSignal) =>
    tenantGet(scope, '/reports/top-items', topItemsResponseSchema, {
      signal,
      code: CODE,
      params: { ...rangeParams(r), page: c.tpage, size: 20, sortBy: c.tsortBy, direction: c.tdirection },
    }),
  orders: (scope: string, r: RangeCriteria, c: ReportOrdersCriteria, signal?: AbortSignal) =>
    tenantGet(scope, '/reports/orders', reportOrdersResponseSchema, {
      signal,
      code: CODE,
      params: {
        ...rangeParams(r),
        dateBasis: c.dateBasis,
        status: c.ostatus || undefined,
        paymentStatus: c.opayment || undefined,
        page: c.opage,
        size: 20,
        sortBy: c.osortBy,
        direction: c.odirection,
      },
    }),
  marginSummary: (scope: string, r: RangeCriteria, signal?: AbortSignal) =>
    tenantGet(scope, '/reports/reference-margin/summary', marginSummaryResponseSchema, { signal, code: CODE, params: rangeParams(r) }),
  marginSeries: (scope: string, r: RangeCriteria, granularity: 'DAY' | 'MONTH', signal?: AbortSignal) =>
    tenantGet(scope, '/reports/reference-margin/series', marginSeriesResponseSchema, {
      signal,
      code: CODE,
      params: { ...rangeParams(r), granularity },
    }),
  marginOrders: (scope: string, r: RangeCriteria, c: MarginOrdersCriteria, signal?: AbortSignal) =>
    tenantGet(scope, '/reports/reference-margin/orders', marginOrdersResponseSchema, {
      signal,
      code: CODE,
      params: { ...rangeParams(r), costCoverage: c.coverage, page: c.mpage, size: 20, sortBy: c.msortBy, direction: c.mdirection },
    }),
}
