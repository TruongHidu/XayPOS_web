import { api } from '../../../shared/api/httpClient'
import { tenantRequest } from '../../../shared/api/tenantRequest'
import { ensureRequestScope } from '../../../shared/api/requestScope'
import { parseTenantResponse } from '../../../shared/api/parseTenantResponse'
import { resourceId } from '../../../shared/api/tenantSchemas'
import {
  qrReviewApproveSchema,
  qrReviewApprovalSchema,
  qrReviewCriteriaSchema,
  qrReviewDetailSchema,
  qrReviewPageSchema,
  qrReviewRejectSchema,
  qrReviewSummarySchema,
} from '../schemas'
import type { QrReviewApprove, QrReviewCriteria, QrReviewReject } from '../types'
const path = (id: string) => '/qr-order-requests/' + encodeURIComponent(resourceId.parse(id))
const invalid = 'INVALID_QR_REVIEW_RESPONSE'
export const qrReviewApi = {
  async list(scope: string, criteria: QrReviewCriteria, signal?: AbortSignal) {
    const config = tenantRequest(scope, signal)
    const response = await api.get<unknown>('/qr-order-requests', {
      ...config,
      params: qrReviewCriteriaSchema.parse(criteria),
    })
    ensureRequestScope(config)
    return parseTenantResponse(qrReviewPageSchema, response.data, invalid)
  },
  async detail(scope: string, id: string, signal?: AbortSignal) {
    const config = tenantRequest(scope, signal)
    const response = await api.get<unknown>(path(id), config)
    ensureRequestScope(config)
    const detail = parseTenantResponse(qrReviewDetailSchema, response.data, invalid)
    if (detail.request.requestId !== resourceId.parse(id)) throw new Error(invalid)
    return detail
  },
  async approve(scope: string, id: string, input: QrReviewApprove) {
    const config = tenantRequest(scope)
    const response = await api.post(path(id) + '/approve', qrReviewApproveSchema.parse(input), config)
    ensureRequestScope(config)
    const result = parseTenantResponse(qrReviewApprovalSchema, response.data, invalid)
    if (result.requestId !== resourceId.parse(id) || result.order.id !== result.approvedOrderId)
      throw new Error(invalid)
    return result
  },
  async reject(scope: string, id: string, input: QrReviewReject) {
    const config = tenantRequest(scope)
    const response = await api.post(path(id) + '/reject', qrReviewRejectSchema.parse(input), config)
    ensureRequestScope(config)
    const result = parseTenantResponse(qrReviewSummarySchema, response.data, invalid)
    if (result.requestId !== resourceId.parse(id) || result.status !== 'REJECTED') throw new Error(invalid)
    return result
  },
}
