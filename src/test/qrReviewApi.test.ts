import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import { qrReviewApi } from '../features/qr-order-review/api/qrReviewApi'
import { qrReviewCriteriaSchema } from '../features/qr-order-review/schemas'
import { canApproveQr, canRejectQr } from '../features/qr-order-review/policies/qrReviewPolicy'
import { useAuthStore } from '../features/auth/store/authStore'
import { base, ids, page, resetOrderTest, seedOrderAccess } from './orderFixtures'
import { reviewApproval, reviewDetail, reviewHash, reviewId, reviewSummary } from './qrReviewFixtures'
describe('Staff QR review contract and access', () => {
  let scope: string
  beforeEach(() => {
    scope = seedOrderAccess()
  })
  afterEach(resetOrderTest)
  it('uses tenant Bearer auth and only supported pending filters without guest tokens', async () => {
    server.use(
      http.get(base + '/qr-order-requests', ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer order-test')
        expect(request.headers.has('x-qr-guest-token')).toBe(false)
        expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
          status: 'PENDING',
          entryType: 'TABLE',
          includeExpired: 'false',
          page: '0',
          size: '20',
          observedSessionId: ids.session,
        })
        return HttpResponse.json(page([reviewSummary()]))
      }),
    )
    const result = await qrReviewApi.list(
      scope,
      qrReviewCriteriaSchema.parse({ entryType: 'TABLE', observedSessionId: ids.session }),
    )
    expect(result.content[0].requestId).toBe(reviewId)
  })
  it('sends an explicit null target for new seating and takeaway, and preserves the reviewed hash/version', async () => {
    server.use(
      http.post(base + '/qr-order-requests/:id/approve', async ({ request }) => {
        expect(await request.json()).toEqual({
          expectedRequestVersion: 2,
          expectedReviewContextHash: reviewHash,
          targetSessionId: null,
        })
        return HttpResponse.json(reviewApproval())
      }),
    )
    await qrReviewApi.approve(scope, reviewId, {
      expectedRequestVersion: 2,
      expectedReviewContextHash: reviewHash,
      targetSessionId: null,
    })
  })
  it('rejects mismatched detail IDs and malformed approval results', async () => {
    server.use(
      http.get(base + '/qr-order-requests/:id', () =>
        HttpResponse.json(reviewDetail({ request: reviewSummary({ requestId: ids.order }) })),
      ),
    )
    await expect(qrReviewApi.detail(scope, reviewId)).rejects.toThrow('INVALID_QR_REVIEW_RESPONSE')
    server.use(
      http.post(base + '/qr-order-requests/:id/approve', () =>
        HttpResponse.json({ ...reviewApproval(), approvedOrderId: ids.item }),
      ),
    )
    await expect(
      qrReviewApi.approve(scope, reviewId, {
        expectedRequestVersion: 2,
        expectedReviewContextHash: reviewHash,
        targetSessionId: null,
      }),
    ).rejects.toThrow('INVALID_QR_REVIEW_RESPONSE')
  })
  it('rejects late responses after a restaurant session change', async () => {
    server.use(
      http.get(base + '/qr-order-requests/:id', () => {
        useAuthStore.getState().clearSession()
        return HttpResponse.json(reviewDetail())
      }),
    )
    await expect(qrReviewApi.detail(scope, reviewId)).rejects.toMatchObject({ code: 'ORDER_ACCESS_CHANGED' })
  })
  it('requires both order permissions and TABLE_OPEN only for new table sessions', () => {
    const access = useAuthStore.getState()
    expect(canApproveQr(access, reviewDetail())).toBe(true)
    expect(
      canApproveQr(
        { ...access, user: { ...access.user!, permissions: ['ORDER_VIEW', 'ORDER_UPDATE', 'ORDER_CREATE'] } },
        reviewDetail(),
      ),
    ).toBe(false)
    const existing = reviewDetail({
      reviewContext: {
        currentSessionId: ids.session,
        tableAccessEpoch: 1,
        sessionVersion: 2,
        guestCount: 2,
        currentOrder: null,
      },
    })
    expect(
      canApproveQr(
        { ...access, user: { ...access.user!, permissions: ['ORDER_VIEW', 'ORDER_UPDATE', 'ORDER_CREATE'] } },
        existing,
      ),
    ).toBe(true)
    expect(
      canApproveQr({ ...access, user: { ...access.user!, permissions: ['ORDER_VIEW', 'ORDER_UPDATE'] } }, existing),
    ).toBe(false)
    expect(
      canRejectQr(
        { ...access, user: { ...access.user!, permissions: ['ORDER_VIEW', 'ORDER_UPDATE'] } },
        existing.request,
      ),
    ).toBe(true)
    expect(
      canApproveQr(
        access,
        reviewDetail({ request: reviewSummary({ expiresAt: new Date(Date.now() - 1).toISOString() }) }),
      ),
    ).toBe(false)
    expect(canApproveQr(access, reviewDetail({ canApprove: false }))).toBe(false)
  })
})
