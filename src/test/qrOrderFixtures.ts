import { http, HttpResponse } from 'msw'
import type { GuestAccess, PublicEntry, QrReceipt } from '../features/qr-order/types'
import { useQrGuestStore } from '../features/qr-order/store/qrOrderGuestStore'
import { useQrDraftStore } from '../features/qr-order/store/qrOrderDraftStore'
export const qrBase = 'http://localhost:8080/api/v1'
export const tableEntry: PublicEntry = { entryType: 'TABLE', token: 'a'.repeat(43) }
export const takeawayEntry: PublicEntry = { entryType: 'RESTAURANT', token: 'b'.repeat(43) }
export const qrIds = {
  item: '22222222-2222-4222-8222-222222222222',
  request: '55555555-5555-4555-8555-555555555555',
  line: '66666666-6666-4666-8666-666666666666',
  restaurant: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  table: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
}
export const qrItem = {
  id: qrIds.item,
  group: null,
  name: 'Phở bò',
  description: 'Nước dùng đậm vị',
  imageUrl: null,
  baseUnit: 'tô',
  salePrice: 45000,
  availabilityStatus: 'AVAILABLE' as const,
}
export const qrContext = {
  restaurant: { name: 'Nhà hàng QR Demo', currencyCode: 'VND' },
  table: { code: 'B01', name: 'Bàn 1' },
  groups: [],
}
export const qrPage = { content: [qrItem], page: 0, size: 20, totalElements: 1, totalPages: 1 }
export function qrGuest(entry = tableEntry): GuestAccess {
  return {
    guestToken: entry.entryType === 'TABLE' ? 'table-guest-token' : 'takeaway-guest-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    entryType: entry.entryType,
    serviceType: entry.entryType === 'TABLE' ? 'DINE_IN' : 'TAKEAWAY',
    sourceChannel: entry.entryType === 'TABLE' ? 'QR_TABLE' : 'QR_STATIC',
    restaurant: { id: qrIds.restaurant, ...qrContext.restaurant },
    table: entry.entryType === 'TABLE' ? { id: qrIds.table, ...qrContext.table } : null,
  }
}
export function qrReceipt(entry = tableEntry, patch: Partial<QrReceipt> = {}): QrReceipt {
  const guest = qrGuest(entry)
  return {
    requestId: qrIds.request,
    entryType: entry.entryType,
    serviceType: guest.serviceType,
    sourceChannel: guest.sourceChannel,
    status: 'PENDING',
    version: 0,
    expired: false,
    currencyCode: 'VND',
    estimatedAmount: 90000,
    approvedAmount: null,
    approvedOrderCode: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 900000).toISOString(),
    items: [
      {
        requestItemId: qrIds.line,
        itemId: qrIds.item,
        itemName: 'Phở bò',
        unit: 'tô',
        quantity: 2,
        estimatedUnitPrice: 45000,
        estimatedLineTotal: 90000,
        note: 'Không hành',
        approvedOrderItemId: null,
        approvedUnitPrice: null,
        approvedLineTotal: null,
        status: null,
      },
    ],
    ...patch,
  }
}
export function qrFailure(code: string, status: number, headers?: Record<string, string>) {
  return HttpResponse.json(
    { success: false, code, message: 'server', fieldErrors: {}, timestamp: new Date().toISOString() },
    { status, headers },
  )
}
export const qrHandlers = [
  http.get(qrBase + '/public/menu/tables/:token', () => HttpResponse.json(qrContext)),
  http.get(qrBase + '/public/menu/restaurants/:token', () =>
    HttpResponse.json({ restaurant: qrContext.restaurant, groups: [] }),
  ),
  http.get(qrBase + '/public/menu/:entry/:token/items', () => HttpResponse.json(qrPage)),
  http.post(qrBase + '/public/qr-order/tables/:token/guest-access', () =>
    HttpResponse.json(qrGuest(), { status: 201 }),
  ),
  http.post(qrBase + '/public/qr-order/restaurants/:token/guest-access', () =>
    HttpResponse.json(qrGuest(takeawayEntry), { status: 201 }),
  ),
  http.post(qrBase + '/public/qr-order/requests', ({ request }) =>
    HttpResponse.json(
      qrReceipt(request.headers.get('X-QR-Guest-Token') === 'takeaway-guest-token' ? takeawayEntry : tableEntry),
      { status: 201 },
    ),
  ),
  http.get(qrBase + '/public/qr-order/requests/:id', ({ request }) =>
    HttpResponse.json(
      qrReceipt(request.headers.get('X-QR-Guest-Token') === 'takeaway-guest-token' ? takeawayEntry : tableEntry),
    ),
  ),
]
export function resetQrOrder() {
  useQrGuestStore.getState().sync(null)
  useQrDraftStore.getState().reset('')
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith('pos-saas:qr-session:v1:')) sessionStorage.removeItem(key)
  }
}
export function seedQrOrder(entry = tableEntry, withGuest = false) {
  resetQrOrder()
  useQrGuestStore.getState().sync(entry)
  if (withGuest) useQrGuestStore.setState({ guest: qrGuest(entry) })
  return useQrGuestStore.getState().scopeId
}
