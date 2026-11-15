import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MenuPage } from '../features/menu/pages/MenuPage'
import { RecipePage } from '../features/menu/pages/RecipePage'
import { canMenuWorkspace, canSetAvailability, canSetInventoryMode } from '../features/menu/policies/menuAccessPolicy'
import { inventoryModeOf } from '../features/menu/adminSchemas'
import { TablesPage } from '../features/tables/pages/TablesPage'
import { useAuthStore } from '../features/auth/store/authStore'
import { areaFixture, base, failure, itemFixture, page, sessionFixture, tableFixture } from './orderFixtures'
import { ingredientFixture, mids, recipeFixture, renderPage, resetTenant, seedTenant } from './managementFixtures'
import { server } from './server'

const accessOf = () => {
  const state = useAuthStore.getState()
  return { user: state.user, entitlement: state.entitlement, entitlementState: state.entitlementState }
}

beforeAll(() => {
  URL.createObjectURL ??= vi.fn(() => 'blob:test')
  URL.revokeObjectURL ??= vi.fn()
})
afterEach(() => {
  cleanup()
  resetTenant()
})

describe('menu policy', () => {
  it('ports the app rules for inventory modes and availability', () => {
    seedTenant({ role: 'CASHIER', permissions: ['MENU_VIEW', 'MENU_CREATE', 'MENU_UPDATE', 'RECIPE_CREATE'], features: ['MENU_MANAGEMENT', 'RECIPE_MANAGEMENT'] })
    const a = accessOf()
    expect(canMenuWorkspace(a)).toBe(true)
    expect(canSetAvailability(a)).toBe(false) // needs MENU_AVAILABILITY_UPDATE (V36)
    expect(canSetInventoryMode(a, { creating: true, from: 'NONE', to: 'RECIPE' })).toBe(true)
    expect(canSetInventoryMode(a, { creating: true, from: 'NONE', to: 'DIRECT' })).toBe(false) // no INVENTORY_MANAGEMENT
    expect(canSetInventoryMode(a, { creating: false, from: 'DIRECT', to: 'DIRECT' })).toBe(true) // keeping a mode is always allowed
    expect(inventoryModeOf({ trackInventory: true, recipeEnabled: false })).toBe('DIRECT')
    expect(inventoryModeOf({ inventoryMode: 'RECIPE', trackInventory: false, recipeEnabled: true })).toBe('RECIPE')
  })
})

describe('menu page', () => {
  const permissions = ['MENU_VIEW', 'MENU_CREATE', 'MENU_UPDATE', 'MENU_DELETE', 'MENU_AVAILABILITY_UPDATE', 'RECIPE_VIEW', 'RECIPE_CREATE', 'INGREDIENT_VIEW', 'INGREDIENT_CREATE']
  const features = ['MENU_MANAGEMENT', 'RECIPE_MANAGEMENT']

  it('creates a RECIPE item without the flag, then opens recipe setup', async () => {
    seedTenant({ permissions, features })
    let body: unknown
    server.use(
      http.get(base + '/menu/items', () => HttpResponse.json(page([itemFixture]))),
      http.get(base + '/menu/groups', () => HttpResponse.json(page([]))),
      http.post(base + '/menu/items', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...itemFixture, id: mids.item, name: 'Bún bò' }, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderPage(<MenuPage />, { path: '/app/menu' })
    expect(await screen.findByText('Phở bò')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Thêm món/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Thêm món' })
    await user.type(within(drawer).getByLabelText(/Tên món/), 'Bún bò')
    await user.type(within(drawer).getByLabelText(/Giá bán/), '45.000')
    await user.type(within(drawer).getByLabelText(/Đơn vị bán/), 'tô')
    expect(within(drawer).getByRole('radio', { name: /Trừ kho trực tiếp/ })).toBeDisabled()
    await user.click(within(drawer).getByRole('radio', { name: /Trừ kho theo công thức/ }))
    await user.click(within(drawer).getByRole('button', { name: 'Thêm món' }))
    await waitFor(() =>
      expect(body).toEqual({
        groupId: null,
        name: 'Bún bò',
        baseUnit: 'tô',
        salePrice: 45000,
        active: true,
        trackInventory: false,
        recipeEnabled: false,
      }),
    )
    expect(await screen.findByTestId('location')).toHaveTextContent(`/app/menu/items/${mids.item}/recipes?setup=1`)
  })

  it('edits only changed fields and toggles availability', async () => {
    seedTenant({ permissions, features })
    let patch: unknown
    let availability: unknown
    server.use(
      http.get(base + '/menu/items', () => HttpResponse.json(page([itemFixture]))),
      http.get(base + '/menu/groups', () => HttpResponse.json(page([]))),
      http.patch(base + '/menu/items/:id', async ({ request }) => {
        patch = await request.json()
        return HttpResponse.json({ ...itemFixture, salePrice: 55000, version: 4 })
      }),
      http.patch(base + '/menu/items/:id/availability', async ({ request }) => {
        availability = await request.json()
        return HttpResponse.json({ ...itemFixture, availabilityStatus: 'OUT_OF_STOCK', version: 4 })
      }),
    )
    const user = userEvent.setup()
    renderPage(<MenuPage />, { path: '/app/menu' })
    await user.click(await screen.findByRole('button', { name: 'Báo hết' }))
    await waitFor(() => expect(availability).toEqual({ availabilityStatus: 'OUT_OF_STOCK', expectedVersion: 3 }))

    await user.click(screen.getByRole('button', { name: 'Sửa' }))
    const drawer = await screen.findByRole('dialog', { name: 'Sửa món: Phở bò' })
    const price = within(drawer).getByLabelText(/Giá bán/)
    await user.clear(price)
    await user.type(price, '55000')
    await user.click(within(drawer).getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(patch).toEqual({ salePrice: 55000, expectedVersion: 3 }))
  })

  it('creates an ingredient with an unknown cost', async () => {
    seedTenant({ permissions, features })
    let body: unknown
    server.use(
      http.get(base + '/menu/ingredients', () => HttpResponse.json(page([ingredientFixture()]))),
      http.post(base + '/menu/ingredients', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(ingredientFixture({ name: 'Hành lá', costConfigured: false, costPrice: 0 }), { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderPage(<MenuPage />, { path: '/app/menu', entry: '/app/menu?tab=ingredients' })
    expect(await screen.findByText('Thịt bò')).toBeInTheDocument()
    expect(screen.getByText((text) => /^250\s₫\/g$/.test(text))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Thêm nguyên liệu/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Thêm nguyên liệu' })
    await user.type(within(drawer).getByLabelText(/Tên nguyên liệu/), 'Hành lá')
    await user.type(within(drawer).getByLabelText(/Đơn vị gốc/), 'g')
    await user.click(within(drawer).getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(body).toEqual({ name: 'Hành lá', baseUnit: 'g', trackInventory: false, active: true }))
  })
})

describe('recipe page', () => {
  it('shows the active recipe, its estimate and creates a new version', async () => {
    seedTenant({ permissions: ['MENU_VIEW', 'MENU_UPDATE', 'RECIPE_VIEW', 'RECIPE_UPDATE', 'RECIPE_DELETE'], features: ['MENU_MANAGEMENT', 'RECIPE_MANAGEMENT'] })
    let body: unknown
    server.use(
      http.get(base + '/menu/items/:id', () => HttpResponse.json({ ...itemFixture, recipeEnabled: true })),
      http.get(base + '/menu/items/:id/recipes/active', () => HttpResponse.json(recipeFixture())),
      http.get(base + '/menu/items/:id/recipes', () =>
        HttpResponse.json(page([{ id: mids.recipe, recipeVersion: 1, yieldQuantity: 10, yieldUnit: 'tô', active: true, ingredientCount: 1, version: 0, createdAt: itemFixture.createdAt, updatedAt: itemFixture.updatedAt }])),
      ),
      http.get(base + '/menu/items/:id/recipes/:recipeId/cost-estimate', () => failure('INGREDIENT_COST_NOT_CONFIGURED')),
      http.post(base + '/menu/items/:id/recipes/:recipeId/versions', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(recipeFixture({ recipeVersion: 2, version: 0 }), { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderPage(<RecipePage />, { path: '/app/menu/items/:menuItemId/recipes', entry: `/app/menu/items/${itemFixture.id}/recipes` })
    expect(await screen.findByText('Phiên bản 1 (đang dùng)')).toBeInTheDocument()
    expect(await screen.findByText(/chưa xác định giá vốn/)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Trừ kho theo công thức khi bán' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: /tạo phiên bản mới/ }))
    const drawer = await screen.findByRole('dialog', { name: /Phiên bản mới cho Phở bò/ })
    const quantity = within(drawer).getByLabelText(/Định lượng/)
    await user.clear(quantity)
    await user.type(quantity, '1300')
    await user.click(within(drawer).getByRole('button', { name: 'Lưu phiên bản mới' }))
    await waitFor(() =>
      expect(body).toEqual({
        expectedVersion: 0,
        yieldQuantity: 10,
        ingredients: [{ ingredientId: mids.ingredient, quantity: 1300, wastePercent: 5 }],
      }),
    )
  })
})

describe('tables page', () => {
  const emptyTable = { ...tableFixture, id: mids.table2, code: 'B02', name: 'Bàn 2', occupied: false, canOpen: true, currentSession: null, version: 5 }

  it('groups tables by area and transfers a session with one idempotency key per intent', async () => {
    seedTenant({ permissions: ['TABLE_VIEW', 'TABLE_TRANSFER', 'TABLE_OPEN', 'TABLE_CLOSE'], features: ['TABLE_MANAGEMENT'] })
    const keys: string[] = []
    let transferBody: unknown
    let attempts = 0
    server.use(
      http.get(base + '/table-areas', () => HttpResponse.json(page([areaFixture]))),
      http.get(base + '/tables', () => HttpResponse.json(page([tableFixture, emptyTable]))),
      http.get(base + '/tables/:id/current-session', () => HttpResponse.json(sessionFixture)),
      http.get(base + '/table-sessions/:id/transfers', () => HttpResponse.json(page([]))),
      http.post(base + '/table-sessions/:id/transfer', async ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '')
        transferBody = await request.json()
        attempts++
        if (attempts === 1) return failure('INTERNAL_ERROR', 503)
        return HttpResponse.json({ ...sessionFixture, tableId: mids.table2, tableName: 'Bàn 2', version: 9 })
      }),
    )
    const user = userEvent.setup()
    renderPage(<TablesPage />, { path: '/app/tables' })
    const area = await screen.findByRole('region', { name: 'Tầng 1' })
    expect(within(area).getByRole('button', { name: /Bàn 1/ })).toHaveTextContent('Đang phục vụ')
    expect(within(area).getByRole('button', { name: /Bàn 2/ })).toHaveTextContent('Trống')

    await user.click(within(area).getByRole('button', { name: /Bàn 1/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Bàn 1' })
    await user.click(await within(drawer).findByRole('button', { name: 'Chuyển bàn' }))
    const dialog = await screen.findByRole('dialog', { name: /Chuyển khách từ Bàn 1/ })
    await user.selectOptions(within(dialog).getByLabelText(/Bàn trống chuyển đến/), mids.table2)
    await user.click(within(dialog).getByRole('button', { name: 'Chuyển bàn' }))
    await within(dialog).findByRole('alert')
    await user.click(within(dialog).getByRole('button', { name: 'Chuyển bàn' }))
    await waitFor(() => expect(attempts).toBe(2))
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
    expect(transferBody).toEqual({ targetTableId: mids.table2, expectedVersion: 8 })
  })

  it('links an empty table to the POS', async () => {
    seedTenant({ permissions: ['TABLE_VIEW', 'ORDER_CREATE', 'ORDER_UPDATE'], features: ['TABLE_MANAGEMENT', 'ORDER_MANAGEMENT'] })
    server.use(
      http.get(base + '/table-areas', () => HttpResponse.json(page([areaFixture]))),
      http.get(base + '/tables', () => HttpResponse.json(page([emptyTable]))),
    )
    const user = userEvent.setup()
    renderPage(<TablesPage />, { path: '/app/tables' })
    await user.click(await screen.findByRole('button', { name: /Bàn 2/ }))
    const link = await screen.findByRole('link', { name: 'Gọi món cho bàn' })
    expect(link).toHaveAttribute('href', `/app/order-create?serviceType=DINE_IN&tableId=${mids.table2}`)
  })
})
