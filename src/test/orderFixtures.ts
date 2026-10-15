import { http, HttpResponse } from 'msw'
import { useAuthStore } from '../features/auth/store/authStore'
import { setAccessToken } from '../shared/api/httpClient'
import { queryClient } from '../shared/api/queryClient'
import { useOrderDraftStore } from '../features/order/store/orderDraftStore'
import { orderScope } from '../features/order/policies/orderAccessPolicy'
import { resetOrderOperations } from '../features/order/store/orderOperationState'
import type { AuthUser, CurrentEntitlement } from '../shared/types/auth'
import type { Order } from '../features/order/types'
import { orderSchema } from '../features/order/schemas'
export const ids = {
  order: '33333333-3333-4333-8333-333333333333',
  line: '55555555-5555-4555-8555-555555555555',
  item: '22222222-2222-4222-8222-222222222222',
  session: '11111111-1111-4111-8111-111111111111',
  table: '66666666-6666-4666-8666-666666666666',
  area: '77777777-7777-4777-8777-777777777777',
  user: '44444444-4444-4444-8444-444444444444',
}
export const allPermissions = [
  'ORDER_VIEW',
  'ORDER_CREATE',
  'ORDER_UPDATE',
  'ORDER_CANCEL',
  'MENU_VIEW',
  'TABLE_VIEW',
  'TABLE_OPEN',
]
export const allFeatures = ['ORDER_MANAGEMENT', 'POS_QUICK_ORDER', 'TABLE_MANAGEMENT', 'MENU_MANAGEMENT']
export const cashierUser: AuthUser = {
  id: ids.user,
  restaurantId: 'restaurant-order',
  restaurantCode: 'POS1',
  restaurantName: 'Nhà hàng mẫu',
  name: 'Thu ngân',
  email: 'cashier@example.invalid',
  phone: null,
  role: 'CASHIER',
  permissions: allPermissions,
}
export const entitlement: CurrentEntitlement = {
  subscriptionId: 'subscription-order',
  packageCode: 'PRO',
  status: 'ACTIVE',
  startAt: '2026-01-01T00:00:00Z',
  endAt: '2027-01-01T00:00:00Z',
  features: allFeatures.map((code) => ({ code, limits: {} })),
}
const dates = { createdAt: '2026-10-08T00:00:00Z', updatedAt: '2026-10-08T00:00:00Z' }
export const itemFixture = {
  id: ids.item,
  group: null,
  sku: null,
  name: 'Phở bò',
  baseUnit: 'tô',
  description: null,
  imageUrl: null,
  salePrice: 50000,
  active: true,
  availabilityStatus: 'AVAILABLE',
  sellable: true,
  version: 3,
  ...dates,
}
export const groupFixture = { id: ids.area, name: 'Món chính', active: true, displayOrder: 0, version: 1, ...dates }
export const areaFixture = {
  id: ids.area,
  name: 'Tầng 1',
  description: null,
  active: true,
  displayOrder: 0,
  version: 1,
  ...dates,
}
export const sessionFixture = {
  id: ids.session,
  sessionCode: 'TS-01',
  tableId: ids.table,
  tableCode: 'B01',
  tableName: 'Bàn 1',
  status: 'OPEN',
  guestCount: 2,
  note: null,
  openedBy: ids.user,
  openedAt: dates.createdAt,
  closedBy: null,
  closedAt: null,
  cancelReason: null,
  version: 8,
  ...dates,
}
export const tableFixture = {
  id: ids.table,
  code: 'B01',
  name: 'Bàn 1',
  capacity: 4,
  displayOrder: 0,
  status: 'AVAILABLE',
  area: { id: ids.area, name: 'Tầng 1', active: true },
  occupied: true,
  canOpen: false,
  currentSession: { id: ids.session, sessionCode: 'TS-01', guestCount: 2, openedAt: dates.createdAt, version: 8 },
  version: 23,
  ...dates,
}
export const orderFixture = () => ({
  id: ids.order,
  orderCode: 'OD-TEST',
  serviceType: 'TAKEAWAY',
  sourceChannel: 'CASHIER',
  tableSessionId: null,
  status: 'OPEN',
  paymentStatus: 'UNPAID',
  customerName: null,
  customerPhone: null,
  guestCount: 1,
  note: null,
  currencyCode: 'VND',
  subtotalAmount: 100000,
  discountAmount: 0,
  taxAmount: 0,
  serviceChargeAmount: 0,
  totalAmount: 100000,
  paidAmount: 0,
  createdBy: ids.user,
  confirmedAt: null,
  completedAt: null,
  cancelledAt: null,
  cancelReason: null,
  version: 5,
  ...dates,
  items: [
    {
      id: ids.line,
      itemId: ids.item,
      itemName: 'Phở bò snapshot',
      unit: 'tô',
      quantity: 2,
      unitPrice: 50000,
      discountAmount: 0,
      lineTotal: 100000,
      status: 'PENDING',
      note: null,
      cancelReason: null,
      sentToKitchenAt: null,
    },
  ],
})
export const makeOrder = (overrides: Partial<Order> = {}) => orderSchema.parse({ ...orderFixture(), ...overrides })
export const page = <T>(content: T[], index = 0, pages = content.length ? 1 : 0) => ({
  content,
  page: index,
  size: 20,
  totalElements: content.length,
  totalPages: pages,
})
export const failure = (code: string, status = 409) =>
  HttpResponse.json(
    { success: false, code, message: 'server', fieldErrors: {}, timestamp: dates.createdAt },
    { status },
  )
export function seedOrderAccess(permissions = allPermissions, features = allFeatures) {
  useAuthStore.getState().clearSession()
  queryClient.clear()
  resetOrderOperations()
  useAuthStore.setState({
    status: 'authenticated',
    user: { ...cashierUser, permissions },
    entitlement: { ...entitlement, features: features.map((code) => ({ code, limits: {} })) },
    entitlementState: 'active',
    bootstrap: async () => undefined,
  })
  setAccessToken('order-test')
  useOrderDraftStore.getState().sync(orderScope(useAuthStore.getState()))
  return orderScope(useAuthStore.getState())!
}
export function resetOrderTest() {
  useAuthStore.getState().clearSession()
  useOrderDraftStore.getState().sync(null)
  queryClient.clear()
  resetOrderOperations()
}
export const base = 'http://localhost:8080/api/v1'
export const orderHandlers = [
  http.get(base + '/qr-order-requests', () => HttpResponse.json(page([]))),
  http.get(base + '/menu/items', () => HttpResponse.json(page([itemFixture]))),
  http.get(base + '/menu/groups', () => HttpResponse.json(page([groupFixture]))),
  http.get(base + '/table-areas', () => HttpResponse.json(page([areaFixture]))),
  http.get(base + '/tables', () => HttpResponse.json(page([tableFixture]))),
  http.get(base + '/tables/:id', () => HttpResponse.json(tableFixture)),
  http.get(base + '/tables/:id/current-session', () => HttpResponse.json(sessionFixture)),
  http.get(base + '/table-sessions/:id', () => HttpResponse.json(sessionFixture)),
  http.get(base + '/table-sessions/:id/active-order', () => new HttpResponse(null, { status: 204 })),
  http.post(base + '/tables/:id/sessions', () => HttpResponse.json(sessionFixture, { status: 201 })),
  http.get(base + '/orders', () => HttpResponse.json(page([orderFixture()]))),
  http.get(base + '/orders/:id', () => HttpResponse.json(orderFixture())),
  http.post(base + '/orders', async ({ request }) => {
    const body = (await request.json()) as { submissionMode?: string; serviceType: string }
    return HttpResponse.json(
      {
        ...orderFixture(),
        serviceType: body.serviceType,
        tableSessionId: body.serviceType === 'DINE_IN' ? ids.session : null,
        ...(body.submissionMode === 'SUBMIT' ? { status: 'CONFIRMED', confirmedAt: dates.createdAt, version: 6 } : {}),
      },
      { status: 201, headers: { 'Idempotency-Replayed': 'false' } },
    )
  }),
  http.patch(base + '/orders/:id', () => HttpResponse.json({ ...orderFixture(), version: 6 })),
  http.post(base + '/orders/:id/items', () => HttpResponse.json({ ...orderFixture(), version: 6 })),
  http.patch(base + '/orders/:id/items/:lineId', () => HttpResponse.json({ ...orderFixture(), version: 6 })),
  http.post(base + '/orders/:id/confirm', () =>
    HttpResponse.json({ ...orderFixture(), status: 'CONFIRMED', confirmedAt: dates.createdAt, version: 6 }),
  ),
  http.post(base + '/orders/:id/items/:lineId/cancel', () =>
    HttpResponse.json({ ...orderFixture(), status: 'CANCELLED', version: 6 }),
  ),
  http.post(base + '/orders/:id/cancel', () =>
    HttpResponse.json({ ...orderFixture(), status: 'CANCELLED', version: 6 }),
  ),
]
