import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { privateMenuItemSchema } from '../features/menu/schemas'
import { privateMenuApi } from '../features/menu/api/privateMenuApi'
import { orderKeys } from '../features/order/api/orderKeys'
import { orderError, isOrderAcceptanceRefusal, unresolvedResult } from '../features/order/utils/orderErrors'
import { createOrderSchema, addItemsSchema } from '../features/order/schemas'
import { publicMenuItemSchema } from '../features/qr-menu/schemas'
import { fetchQrMenuItems } from '../features/qr-menu/api/publicQrMenuApi'
import { qrReceiptSchema } from '../features/qr-order/schemas'
import { publicQrOrderApi } from '../features/qr-order/api/publicQrOrderApi'
import { queryClient } from '../shared/api/queryClient'
import { server } from './server'
import { base, ids, itemFixture, orderHandlers, page, resetOrderTest, seedOrderAccess } from './orderFixtures'
import { qrGuest, qrItem, qrReceipt, tableEntry } from './qrOrderFixtures'

const privateMetadata = {
  costPrice: 12000,
  costConfigured: true,
  recipeEnabled: true,
  recipeEnabledSnapshot: true,
  costSourceSnapshot: 'RECIPE',
  recipeUsages: [{ quantity: 3 }],
}
const acceptanceCodes = [
  'ACTIVE_RECIPE_REQUIRED',
  'RECIPE_INGREDIENT_UNAVAILABLE',
  'RECIPE_INGREDIENT_UNIT_MISMATCH',
  'RECIPE_YIELD_UNIT_MISMATCH',
  'INSUFFICIENT_AVAILABLE_STOCK',
  'INVENTORY_DEFAULT_WAREHOUSE_REQUIRED',
  'INVALID_RECIPE_SNAPSHOT_DATA',
  'RECIPE_USAGE_QUANTITY_OUT_OF_RANGE',
]
let scope: string
beforeEach(() => {
  scope = seedOrderAccess()
  server.use(...orderHandlers)
})
afterEach(resetOrderTest)

describe('Private menu recipe application and reference cost DTO', () => {
  it.each([
    { costPrice: 0, costConfigured: false, recipeEnabled: false },
    { costPrice: 0, costConfigured: true, recipeEnabled: true },
    { costPrice: 25000, costConfigured: true, recipeEnabled: false },
    { costPrice: 25000, costConfigured: true, recipeEnabled: true },
  ])('keeps explicit flags independent of amount: %o', (flags) => {
    expect(privateMenuItemSchema.parse({ ...itemFixture, ...flags })).toMatchObject(flags)
  })
  it.each(['costPrice', 'costConfigured', 'recipeEnabled'] as const)(
    'rejects missing %s rather than guessing a default',
    (field) => {
      const legacy: Record<string, unknown> = { ...itemFixture }
      delete legacy[field]
      expect(privateMenuItemSchema.safeParse(legacy).success).toBe(false)
    },
  )
  it.each([
    { costPrice: -1 },
    { costPrice: 0.001 },
    { costPrice: '0' },
    { costConfigured: null },
    { costConfigured: 'false' },
    { recipeEnabled: null },
    { recipeEnabled: 'true' },
  ])('rejects invalid field types or amounts: %o', (patch) => {
    expect(privateMenuItemSchema.safeParse({ ...itemFixture, ...patch }).success).toBe(false)
  })
  it('private API preserves manual price even if a response includes recipe estimate data', async () => {
    server.use(
      http.get(base + '/menu/items', ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer order-test')
        expect(new URL(request.url).searchParams.get('sellable')).toBe('true')
        return HttpResponse.json(
          page([{ ...itemFixture, costPrice: 0, costConfigured: true, recipeEnabled: true, costPerYieldUnit: 99999 }]),
        )
      }),
    )
    const result = await privateMenuApi.items(scope, { q: '', page: 0 })
    expect(result.content[0]).toMatchObject({ costPrice: 0, costConfigured: true, recipeEnabled: true })
    expect(result.content[0]).not.toHaveProperty('costPerYieldUnit')
  })
  it('an old server response is rejected without fabricating recipe/cost configuration', async () => {
    const legacy: Record<string, unknown> = { ...itemFixture }
    delete legacy.recipeEnabled
    delete legacy.costConfigured
    server.use(http.get(base + '/menu/items', () => HttpResponse.json(page([legacy]))))
    await expect(privateMenuApi.items(scope, { q: '', page: 0 })).rejects.toThrow('INVALID_TENANT_RESPONSE')
  })
  it('fresh query version bypasses a still-fresh legacy menu cache; invalidation remains scoped', async () => {
    const criteria = { q: '', page: 0 }
    const legacyKey = ['cashier', scope, 'menu', criteria] as const
    const legacy: Record<string, unknown> = { ...itemFixture }
    delete legacy.recipeEnabled
    delete legacy.costConfigured
    queryClient.setQueryData(legacyKey, page([legacy]))
    const otherKey = orderKeys.menu('another-tenant', criteria)
    queryClient.setQueryData(otherKey, page([itemFixture]))
    let gets = 0
    server.use(
      http.get(base + '/menu/items', () => {
        gets++
        return HttpResponse.json(page([{ ...itemFixture, recipeEnabled: true, costConfigured: false }]))
      }),
    )
    const currentKey = orderKeys.menu(scope, criteria)
    const result = await queryClient.fetchQuery({
      queryKey: currentKey,
      queryFn: () => privateMenuApi.items(scope, criteria),
      staleTime: Infinity,
    })
    expect(currentKey).not.toEqual(legacyKey)
    expect(gets).toBe(1)
    expect(result.content[0]).toMatchObject({ recipeEnabled: true, costConfigured: false })
    expect(queryClient.getQueryData(legacyKey)).toEqual(page([legacy]))
    await queryClient.invalidateQueries({ queryKey: orderKeys.menus(scope), refetchType: 'none' })
    expect(queryClient.getQueryState(currentKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(legacyKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(otherKey)?.isInvalidated).toBe(false)
  })
})

describe('ORDER acceptance failures', () => {
  const failure = (code: string, status = 409) =>
    new AxiosError('server', undefined, undefined, undefined, {
      status,
      statusText: 'Conflict',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { code, message: 'server' },
    })
  it.each(acceptanceCodes)('%s is a definite rollback with an actionable staff message', (code) => {
    const error = failure(code)
    expect(orderError(error)).toMatchObject({ code, status: 409, isNetworkError: false })
    expect(orderError(error).message).not.toBe('server')
    expect(orderError(error).message).toContain('Nội dung được giữ')
    expect(isOrderAcceptanceRefusal(error)).toBe(true)
    expect(unresolvedResult(error)).toBe(false)
    expect(orderError(new Error(code)).message).toBe(orderError(error).message)
  })
  it.each([
    'CONCURRENT_ORDER_UPDATE',
    'ORDER_ITEM_RECIPE_SNAPSHOT_CONFLICT',
    'IDEMPOTENCY_KEY_REUSED',
    'UNRECOGNIZED_CONFLICT',
  ])('keeps %s distinct from a recipe/stock rollback', (code) => {
    expect(isOrderAcceptanceRefusal(failure(code))).toBe(false)
  })
  it('does not infer a definite rollback from an authentication, network or server error', () => {
    expect(isOrderAcceptanceRefusal(failure('ACTIVE_RECIPE_REQUIRED', 503))).toBe(false)
    expect(isOrderAcceptanceRefusal(failure('FORBIDDEN', 403))).toBe(false)
    expect(isOrderAcceptanceRefusal(new AxiosError('network'))).toBe(false)
    expect(unresolvedResult(new AxiosError('network'))).toBe(true)
  })
})

describe('Public boundary and command field allowlists', () => {
  it('public menu and guest receipt omit private metadata even if supplied by a response', () => {
    expect(publicMenuItemSchema.parse(qrItem)).toEqual(qrItem)
    expect(publicMenuItemSchema.parse({ ...qrItem, ...privateMetadata })).toEqual(qrItem)
    const receipt = qrReceipt()
    expect(
      qrReceiptSchema.parse({
        ...receipt,
        ...privateMetadata,
        items: receipt.items.map((line) => ({ ...line, ...privateMetadata })),
      }),
    ).toEqual(receipt)
  })
  it('public menu uses public endpoint without staff bearer and strips internal fields', async () => {
    server.use(
      http.get(base + '/public/menu/tables/:token/items', ({ request }) => {
        expect(request.headers.get('Authorization')).toBeNull()
        return HttpResponse.json(page([{ ...qrItem, ...privateMetadata }]))
      }),
    )
    const result = await fetchQrMenuItems(tableEntry.token, { page: 0, size: 20, sortBy: 'name', direction: 'asc' })
    expect(result.content).toEqual([qrItem])
  })
  it.each([
    'recipeEnabled',
    'costConfigured',
    'costSourceSnapshot',
    'recipeEnabledSnapshot',
    'costPrice',
    'recipeUsages',
  ] as const)('ORDER builders reject internal field %s at root and line level', (field) => {
    const line = { itemId: ids.item, quantity: 1 }
    const create = { serviceType: 'TAKEAWAY', sourceChannel: 'CASHIER', submissionMode: 'SUBMIT', items: [line] }
    const append = { expectedVersion: 5, submissionMode: 'SUBMIT', items: [line] }
    expect(createOrderSchema.safeParse({ ...create, [field]: privateMetadata[field] }).success).toBe(false)
    expect(
      createOrderSchema.safeParse({ ...create, items: [{ ...line, [field]: privateMetadata[field] }] }).success,
    ).toBe(false)
    expect(addItemsSchema.safeParse({ ...append, [field]: privateMetadata[field] }).success).toBe(false)
    expect(addItemsSchema.safeParse({ ...append, items: [{ ...line, [field]: privateMetadata[field] }] }).success).toBe(
      false,
    )
  })
  it('guest submit keeps its existing payload/auth and returns PENDING without private state', async () => {
    const guest = qrGuest()
    const input = { items: [{ itemId: ids.item, quantity: 1, note: 'không hành' }] }
    server.use(
      http.post(base + '/public/qr-order/requests', async ({ request }) => {
        expect(await request.json()).toEqual(input)
        expect(request.headers.get('Authorization')).toBeNull()
        expect(request.headers.get('X-QR-Guest-Token')).toBe(guest.guestToken)
        expect(request.headers.get('Idempotency-Key')).toBe('guest-recipe-intent')
        return HttpResponse.json({ ...qrReceipt(), ...privateMetadata }, { status: 201 })
      }),
    )
    const result = await publicQrOrderApi.submit(tableEntry, guest.guestToken, input, 'guest-recipe-intent')
    expect(result.receipt.status).toBe('PENDING')
    expect(result.receipt).not.toHaveProperty('recipeEnabled')
    expect(result.receipt).not.toHaveProperty('costPrice')
  })
})
