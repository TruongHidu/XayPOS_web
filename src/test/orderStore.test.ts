import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { http, HttpResponse, delay } from 'msw'
import { server } from './server'
import {
  seedOrderAccess,
  resetOrderTest,
  orderHandlers,
  orderFixture,
  itemFixture,
  base,
  cashierUser,
  entitlement,
  allPermissions,
  ids,
  makeOrder,
} from './orderFixtures'
import { useOrderDraftStore, draftTotal } from '../features/order/store/orderDraftStore'
import { privateMenuItemSchema } from '../features/menu/schemas'
import { useAuthStore } from '../features/auth/store/authStore'
import { orderScope, canCreateType, canOrder, canMenu, canTables } from '../features/order/policies/orderAccessPolicy'
import {
  lineCancelPermission,
  editable,
  cancellable,
  lineCancellable,
  appendable,
} from '../features/order/policies/orderActionPolicy'
import { orderKeys } from '../features/order/api/orderKeys'
import { setAccessToken } from '../shared/api/httpClient'
import { ordersApi } from '../features/order/api/ordersApi'
import { buildOrderCommand, editorDefaults } from '../features/order/utils/orderCommands'
const item = privateMenuItemSchema.parse(itemFixture)
beforeEach(() => {
  seedOrderAccess()
  server.use(...orderHandlers)
  useOrderDraftStore.getState().start({ serviceType: 'TAKEAWAY', tableSessionId: null, guestCount: 1 })
})
afterEach(() => {
  vi.restoreAllMocks()
  resetOrderTest()
})
it('create-only takeaway works without TABLE_VIEW or ORDER_VIEW', async () => {
  seedOrderAccess(
    ['ORDER_CREATE', 'ORDER_UPDATE', 'MENU_VIEW'],
    ['ORDER_MANAGEMENT', 'POS_QUICK_ORDER', 'MENU_MANAGEMENT'],
  )
  const state = useOrderDraftStore.getState()
  state.start({ serviceType: 'TAKEAWAY', tableSessionId: null, guestCount: 1 })
  state.add(item)
  const order = await state.submit()
  expect(order?.id).toBe(ids.order)
  expect(canTables(useAuthStore.getState())).toBe(false)
})
it('double-click creates one intent; payload is frozen and retry reuses it', async () => {
  const posts: { key: string | null; body: unknown }[] = []
  let finish: (value: void) => void = () => {}
  const wait = new Promise<void>((r) => {
    finish = r
  })
  server.use(
    http.post(base + '/orders', async ({ request }) => {
      posts.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() })
      if (posts.length === 1) {
        await wait
        return HttpResponse.error()
      }
      return HttpResponse.json({ ...orderFixture(), status: 'CONFIRMED', version: 9 })
    }),
  )
  const s = useOrderDraftStore.getState()
  s.add(item)
  s.fields({ customerName: 'Khách' })
  const first = s.submit()
  await s.submit()
  await vi.waitFor(() => expect(posts).toHaveLength(1))
  finish()
  await first
  expect(useOrderDraftStore.getState().uncertain).toBe(true)
  expect(Object.isFrozen(useOrderDraftStore.getState().submitted!.input)).toBe(true)
  const key = useOrderDraftStore.getState().lines[0].id
  s.fields({ customerName: 'Changed' })
  s.remove(key)
  s.add(item)
  expect(useOrderDraftStore.getState().lines).toHaveLength(1)
  expect(s.discard()).toBe(false)
  await s.submit()
  expect(posts[0]).toEqual(posts[1])
  expect(useOrderDraftStore.getState().result?.version).toBe(9)
})
it('key collision/500/malformed response stay unresolved, not replaced with fresh intent', async () => {
  server.use(http.post(base + '/orders', () => HttpResponse.json({}, { status: 201 })))
  const s = useOrderDraftStore.getState()
  s.add(item)
  await s.submit()
  expect(useOrderDraftStore.getState().uncertain).toBe(true)
  expect(useOrderDraftStore.getState().submitted).not.toBeNull()
})
it('routine token/entitlement loading keeps exact scope and draft', () => {
  const s = useOrderDraftStore.getState()
  s.add(item)
  const scope = s.scope
  setAccessToken('rotated')
  useAuthStore.setState({ entitlementState: 'loading', user: { ...cashierUser } })
  expect(orderScope(useAuthStore.getState())).toBe(scope)
  s.sync(orderScope(useAuthStore.getState()))
  expect(useOrderDraftStore.getState().lines).toHaveLength(1)
  expect(canOrder(useAuthStore.getState(), 'ORDER_CREATE')).toBe(false)
  useAuthStore.setState({ entitlementState: 'active' })
  expect(canOrder(useAuthStore.getState(), 'ORDER_CREATE')).toBe(true)
})
it('scope change clears cart and rejects late create response', async () => {
  server.use(
    http.post(base + '/orders', async () => {
      await delay(40)
      return HttpResponse.json(orderFixture(), { status: 201 })
    }),
  )
  const s = useOrderDraftStore.getState()
  s.add(item)
  const pending = s.submit()
  useAuthStore.setState({ user: { ...cashierUser, restaurantId: 'other' } })
  s.sync(orderScope(useAuthStore.getState()))
  await pending
  expect(useOrderDraftStore.getState().result).toBeNull()
  expect(useOrderDraftStore.getState().lines).toHaveLength(0)
})
it('no owner bypass/menu bypass/feature by package name', () => {
  useAuthStore.setState({ user: { ...cashierUser, role: 'OWNER', permissions: [] } })
  expect(canOrder(useAuthStore.getState(), 'ORDER_CREATE')).toBe(false)
  expect(canMenu(useAuthStore.getState())).toBe(false)
  useAuthStore.setState({
    user: { ...cashierUser, permissions: allPermissions },
    entitlement: { ...entitlement, features: [] },
  })
  expect(canCreateType(useAuthStore.getState(), 'TAKEAWAY')).toBe(false)
})
it('100 line limit and distinct lines with different notes; BigInt preview exact', () => {
  const s = useOrderDraftStore.getState()
  s.add(item)
  s.edit(useOrderDraftStore.getState().lines[0].id, '1.125', 'A')
  s.add(item)
  s.edit(useOrderDraftStore.getState().lines[1].id, '2', 'B')
  const lines = useOrderDraftStore.getState().lines
  expect(lines[0].id).not.toBe(lines[1].id)
  expect(draftTotal(useOrderDraftStore.getState().lines)).toBe(15625000n)
  for (let i = 2; i < 110; i++) s.add({ ...item, id: 'item-' + i })
  expect(useOrderDraftStore.getState().lines).toHaveLength(100)
})
it('1 lan goi thi cong don so luong khi cung mon va chua co ghi chu rieng', () => {
  const s = useOrderDraftStore.getState()
  s.start({ serviceType: 'TAKEAWAY', tableSessionId: null, guestCount: 1 })
  s.add(item)
  expect(useOrderDraftStore.getState().lines).toHaveLength(1)
  expect(useOrderDraftStore.getState().lines[0].quantity).toBe('1')
  s.add(item)
  expect(useOrderDraftStore.getState().lines).toHaveLength(1)
  expect(useOrderDraftStore.getState().lines[0].quantity).toBe('2')
  s.add(item)
  expect(useOrderDraftStore.getState().lines).toHaveLength(1)
  expect(useOrderDraftStore.getState().lines[0].quantity).toBe('3')
})
it('snapshot and cancel policy separate root/line and confirmedAt', () => {
  const open = makeOrder()
  expect(editable(open)).toBe(true)
  expect(lineCancelPermission(open)).toBe('ORDER_UPDATE')
  const confirmed = makeOrder({ status: 'CONFIRMED', confirmedAt: '2026-10-08T00:00:00Z' })
  expect(editable(confirmed)).toBe(false)
  expect(lineCancelPermission(confirmed)).toBe('ORDER_CANCEL')
  const cooked = { ...confirmed.items[0], id: 'another', status: 'COOKING' as const }
  const mixed = { ...confirmed, items: [confirmed.items[0], cooked] }
  expect(cancellable(mixed)).toBe(false)
  expect(lineCancellable(mixed, mixed.items[0])).toBe(true)
  expect(lineCancelPermission({ ...confirmed, status: 'CANCELLED' })).toBe('ORDER_CANCEL')
})
it('query keys include identity/tenant/filter; baseline metadata/line not refreshed silently', () => {
  const a = orderScope(useAuthStore.getState())
  const b = orderScope({ ...useAuthStore.getState(), user: { ...cashierUser, restaurantId: 'other' } })
  expect(orderKeys.detail(a, ids.order)).not.toEqual(orderKeys.detail(b, ids.order))
  const order = makeOrder()
  const fields = editorDefaults(order)
  fields.note = 'draft'
  const command = buildOrderCommand('metadata', order, fields)
  expect(command.input.expectedVersion).toBe(5)
  expect(command).toEqual({ kind: 'update', input: { expectedVersion: 5, note: 'draft' } })
  const lineFields = editorDefaults(order, order.items[0])
  lineFields.quantity = '3'
  expect(buildOrderCommand('line', order, lineFields, order.items[0])).toEqual({
    kind: 'line',
    lineId: ids.line,
    input: { expectedVersion: 5, quantity: 3 },
  })
})
it('known business refusal keeps editable cart, no automatic create retry', async () => {
  let calls = 0
  server.use(
    http.post(base + '/orders', () => {
      calls++
      return HttpResponse.json({ code: 'ITEM_OUT_OF_STOCK' }, { status: 409 })
    }),
  )
  const s = useOrderDraftStore.getState()
  s.add(item)
  await s.submit()
  expect(calls).toBe(1)
  expect(useOrderDraftStore.getState().uncertain).toBe(false)
  expect(useOrderDraftStore.getState().lines).toHaveLength(1)
  expect(useOrderDraftStore.getState().submitted).toBeNull()
})
it('quantity validation and unsafe guest counts do not send create', async () => {
  const create = vi.spyOn(ordersApi, 'create')
  const s = useOrderDraftStore.getState()
  s.add(item)
  s.fields({ guestCount: 'abc' })
  await s.submit()
  expect(create).not.toHaveBeenCalled()
})
it('SUBMIT requires ORDER_UPDATE and TABLE_OPEN only for a fresh empty-table intent', async () => {
  seedOrderAccess(['ORDER_CREATE', 'MENU_VIEW'])
  expect(canCreateType(useAuthStore.getState(), 'TAKEAWAY')).toBe(false)
  seedOrderAccess(allPermissions.filter((permission) => permission !== 'TABLE_OPEN'))
  const create = vi.spyOn(ordersApi, 'create')
  const draft = useOrderDraftStore.getState()
  draft.start({ serviceType: 'DINE_IN', tableId: ids.table, tableSessionId: null, guestCount: 2 })
  draft.add(item)
  await draft.submit()
  expect(create).not.toHaveBeenCalled()
  expect(useOrderDraftStore.getState().error?.code).toBe('TABLE_OPEN_REQUIRED')
})
it('tableId create retry freezes seating, SUBMIT and key without sending sessionId', async () => {
  const calls: { key: string | null; body: unknown }[] = []
  server.use(
    http.post(base + '/orders', async ({ request }) => {
      calls.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() })
      return calls.length === 1
        ? HttpResponse.error()
        : HttpResponse.json({
            ...orderFixture(),
            serviceType: 'DINE_IN',
            tableSessionId: ids.session,
            status: 'CONFIRMED',
            version: 8,
          })
    }),
  )
  const draft = useOrderDraftStore.getState()
  draft.discard()
  draft.start({ serviceType: 'DINE_IN', tableId: ids.table, tableSessionId: null, guestCount: 2 })
  draft.add(item)
  await draft.submit()
  expect(useOrderDraftStore.getState().uncertain).toBe(true)
  expect(calls[0].body).toMatchObject({ tableId: ids.table, submissionMode: 'SUBMIT' })
  expect(calls[0].body).not.toHaveProperty('tableSessionId')
  await draft.submit()
  expect(calls[1]).toEqual(calls[0])
  expect(useOrderDraftStore.getState().result?.tableSessionId).toBe(ids.session)
})
it.each(['CONFIRMED', 'PREPARING', 'READY', 'SERVED'] as const)(
  'append on %s preserves OPEN-only editing and PAID lock',
  (status) => {
    const order = makeOrder({ status })
    expect(appendable(order)).toBe(true)
    expect(editable(order)).toBe(false)
    expect(appendable({ ...order, paymentStatus: 'PAID', paidAmount: order.totalAmount })).toBe(false)
    expect(lineCancellable({ ...order, status: 'PREPARING' }, order.items[0])).toBe(true)
  },
)
