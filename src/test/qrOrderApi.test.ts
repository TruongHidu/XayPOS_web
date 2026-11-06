import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import { publicQrOrderApi } from '../features/qr-order/api/publicQrOrderApi'
import { guestAccessSchema, qrReceiptSchema, qrRequestInputSchema } from '../features/qr-order/schemas'
import { fetchQrMenuContext, fetchQrMenuItems } from '../features/qr-menu/api/publicQrMenuApi'
import { setAccessToken } from '../shared/api/httpClient'
import { retryAfter } from '../features/qr-order/utils/qrOrderErrors'
import { receiptLabel, receiptNeedsPolling } from '../features/qr-order/policies/qrOrderPolicy'
import {
  qrBase,
  qrIds,
  qrGuest,
  qrReceipt,
  qrHandlers,
  resetQrOrder,
  tableEntry,
  takeawayEntry,
} from './qrOrderFixtures'
const body = { customerName: 'Khách', items: [{ itemId: qrIds.item, quantity: 1.125, note: 'Ít cay' }] }
describe('Public QR order API', () => {
  beforeEach(() => {
    server.use(...qrHandlers)
    setAccessToken('staff-must-not-be-sent')
  })
  afterEach(() => {
    setAccessToken(null)
    resetQrOrder()
  })
  it.each([tableEntry, takeawayEntry])(
    'uses exact $entryType namespace and empty guest body without auth',
    async (entry) => {
      let requestBody: unknown
      server.use(
        http.post(qrBase + '/public/qr-order/:namespace/:token/guest-access', async ({ request, params }) => {
          expect(params.namespace).toBe(entry.entryType === 'TABLE' ? 'tables' : 'restaurants')
          expect(params.token).toBe(entry.token)
          expect(request.headers.get('Authorization')).toBeNull()
          expect(request.headers.get('X-QR-Guest-Token')).toBeNull()
          requestBody = await request.json()
          return HttpResponse.json(qrGuest(entry), { status: 201 })
        }),
      )
      const guest = await publicQrOrderApi.guest(entry)
      expect(requestBody).toEqual({})
      expect(guest.entryType).toBe(entry.entryType)
      expect(guest.table === null).toBe(entry.entryType === 'RESTAURANT')
    },
  )
  it('restaurant menu has no table and still uses isolated public GETs', async () => {
    server.use(
      http.get(qrBase + '/public/menu/restaurants/:token/items', ({ request }) => {
        expect(request.headers.get('Authorization')).toBeNull()
        expect(request.headers.get('X-QR-Guest-Token')).toBeNull()
        expect(new URL(request.url).searchParams.get('q')).toBe('Phở')
        return HttpResponse.json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })
      }),
    )
    expect(await fetchQrMenuContext(takeawayEntry.token, undefined, 'RESTAURANT')).not.toHaveProperty('table')
    await fetchQrMenuItems(
      takeawayEntry.token,
      { q: 'Phở', page: 0, size: 20, sortBy: 'salePrice', direction: 'desc' },
      undefined,
      'RESTAURANT',
    )
  })
  it('POST/GET receipt headers, replay 200, exact body and terminal replay', async () => {
    const approved = qrReceipt(tableEntry, {
      status: 'APPROVED',
      expired: true,
      version: 1,
      approvedAmount: 95000,
      approvedOrderCode: 'OD-QR',
    })
    server.use(
      http.post(qrBase + '/public/qr-order/requests', async ({ request }) => {
        expect(request.headers.get('Authorization')).toBeNull()
        expect(request.headers.get('X-QR-Guest-Token')).toBe('same-guest')
        expect(request.headers.get('Idempotency-Key')).toBe('qr-key-001')
        expect(await request.json()).toEqual(body)
        return HttpResponse.json(approved, { headers: { 'Idempotency-Replayed': 'true' } })
      }),
      http.get(qrBase + '/public/qr-order/requests/:id', ({ request }) => {
        expect(request.headers.get('X-QR-Guest-Token')).toBe('same-guest')
        expect(request.headers.get('Idempotency-Key')).toBeNull()
        return HttpResponse.json(approved)
      }),
    )
    expect(await publicQrOrderApi.submit(tableEntry, 'same-guest', body, 'qr-key-001')).toMatchObject({
      replayed: true,
      receipt: { status: 'APPROVED', expired: true },
    })
    expect((await publicQrOrderApi.receipt('same-guest', qrIds.request)).approvedAmount).toBe(95000)
  })
  it.each(['', 'space key', 'a/b', 'é', 'x'.repeat(101)])('rejects unsupported key before POST: %s', async (key) => {
    await expect(publicQrOrderApi.submit(tableEntry, 'guest', body, key)).rejects.toThrow()
  })
  it.each([0, -1, 20.001, 0.0001, Number.NaN, Number.POSITIVE_INFINITY])('rejects quantity %s', (quantity) => {
    expect(qrRequestInputSchema.safeParse({ items: [{ itemId: qrIds.item, quantity }] }).success).toBe(false)
  })
  it('rejects unknown fields, strings, oversized notes and line count; allows 3 decimal precision', async () => {
    expect(qrRequestInputSchema.safeParse({ ...body, tableId: qrIds.table }).success).toBe(false)
    expect(qrRequestInputSchema.safeParse({ items: [{ itemId: qrIds.item, quantity: '2' }] }).success).toBe(false)
    expect(qrRequestInputSchema.safeParse({ ...body, note: 'x'.repeat(501) }).success).toBe(false)
    expect(qrRequestInputSchema.safeParse({ items: Array.from({ length: 21 }, () => body.items[0]) }).success).toBe(
      false,
    )
    expect(qrRequestInputSchema.safeParse({ items: [{ itemId: qrIds.item, quantity: 0.001 }] }).success).toBe(true)
    await expect(
      publicQrOrderApi.submit(takeawayEntry, 'guest', { ...body, customerName: '   ' }, 'key'),
    ).rejects.toThrow()
  })
  it('checks UTF-8 32KiB limit, not character count', async () => {
    const large = {
      customerName: '漢'.repeat(100),
      customerPhone: '漢'.repeat(30),
      note: '漢'.repeat(500),
      items: Array.from({ length: 20 }, () => ({ itemId: qrIds.item, quantity: 20, note: '漢'.repeat(500) })),
    }
    expect(JSON.stringify(large).length).toBeLessThan(32768)
    await expect(publicQrOrderApi.submit(tableEntry, 'guest', large, 'key')).rejects.toThrow(
      'QR_REQUEST_BODY_TOO_LARGE',
    )
  })
  it('required nullable fields and mapping are validated without fake defaults', async () => {
    expect(qrReceiptSchema.parse(qrReceipt()).items[0].approvedLineTotal).toBeNull()
    expect(guestAccessSchema.safeParse({ ...qrGuest(takeawayEntry), table: qrGuest().table }).success).toBe(false)
    for (const field of ['version', 'expired', 'approvedAmount', 'approvedOrderCode']) {
      const invalid: Record<string, unknown> = qrReceipt()
      delete invalid[field]
      expect(qrReceiptSchema.safeParse(invalid).success).toBe(false)
    }
    server.use(http.post(qrBase + '/public/qr-order/requests', () => HttpResponse.json({})))
    await expect(publicQrOrderApi.submit(tableEntry, 'guest', body, 'key')).rejects.toThrow('INVALID_QR_RESPONSE')
  })
  it('status takes precedence over deadline; approved item updates need polling even at same version', () => {
    const approved = qrReceipt(tableEntry, { status: 'APPROVED', expired: true })
    expect(receiptLabel(approved)).toBe('Nhà hàng đã nhận yêu cầu')
    expect(receiptNeedsPolling(approved)).toBe(true)
    expect(receiptNeedsPolling({ ...approved, items: [{ ...approved.items[0], status: 'SERVED' }] })).toBe(false)
    expect(receiptNeedsPolling(qrReceipt(tableEntry, { expired: true }))).toBe(false)
    expect(receiptNeedsPolling(qrReceipt(tableEntry, { status: 'REJECTED' }))).toBe(false)
    expect(retryAfter('5', 1000)).toBe(6000)
    expect(retryAfter('Wed, 14 Oct 2026 15:00:00 GMT', 1000)).toBe(Date.parse('2026-10-14T15:00:00Z'))
  })
})
