import type { z } from 'zod'
import type {
  qrReviewCriteriaSchema,
  qrReviewSummarySchema,
  qrReviewDetailSchema,
  qrReviewApproveSchema,
  qrReviewRejectSchema,
} from './schemas'
export type QrReviewCriteria = z.infer<typeof qrReviewCriteriaSchema>
export type QrReviewSummary = z.infer<typeof qrReviewSummarySchema>
export type QrReviewDetail = z.infer<typeof qrReviewDetailSchema>
export type QrReviewApprove = z.infer<typeof qrReviewApproveSchema>
export type QrReviewReject = z.infer<typeof qrReviewRejectSchema>
