import { api } from '../../../shared/api/httpClient'
import type { PageResponse } from '../../../shared/types/auth'
import type {
  PaymentEventCriteria,
  PaymentEventSummary,
  PaymentReviewCounts,
  PurchaseCriteria,
  PurchaseDetail,
  PurchaseSummary,
} from '../../../shared/types/adminPayments'

const compact = (criteria: object) => Object.fromEntries(Object.entries(criteria).filter(([, value]) => value !== ''))

export const adminPurchasesApi = {
  list: (criteria: PurchaseCriteria) =>
    api.get<PageResponse<PurchaseSummary>>('/admin/subscription-purchases', { params: compact(criteria) }).then((r) => r.data),
  getById: (purchaseId: string) =>
    api.get<PurchaseDetail>(`/admin/subscription-purchases/${encodeURIComponent(purchaseId)}`).then((r) => r.data),
  close: (purchaseId: string, note: string) =>
    api.post<PurchaseDetail>(`/admin/subscription-purchases/${encodeURIComponent(purchaseId)}/close`, { note }).then((r) => r.data),
  resumeActivation: (purchaseId: string) =>
    api.post<PurchaseDetail>(`/admin/subscription-purchases/${encodeURIComponent(purchaseId)}/resume-activation`).then((r) => r.data),
}

export const adminPaymentEventsApi = {
  list: (criteria: PaymentEventCriteria) =>
    api.get<PageResponse<PaymentEventSummary>>('/admin/payment-events', { params: compact(criteria) }).then((r) => r.data),
  close: (eventId: string, request: { note: string; resolutionReference: string }) =>
    api.post<PaymentEventSummary>(`/admin/payment-events/${encodeURIComponent(eventId)}/close`, request).then((r) => r.data),
  retry: (eventId: string) =>
    api.post<PaymentEventSummary>(`/admin/payment-events/${encodeURIComponent(eventId)}/retry`).then((r) => r.data),
  accept: (eventId: string, request: { note: string; purchaseId?: string }) =>
    api.post<PaymentEventSummary>(`/admin/payment-events/${encodeURIComponent(eventId)}/accept`, request).then((r) => r.data),
  counts: () => api.get<PaymentReviewCounts>('/admin/payment-reviews/counts').then((r) => r.data),
}
