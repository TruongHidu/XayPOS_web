import { z } from 'zod'
import { api } from '../../../shared/api/httpClient'
import { ensureRequestScope } from '../../../shared/api/requestScope'
import { parseTenantResponse } from '../../../shared/api/parseTenantResponse'
import { enc, tenantGet, tenantGetOptional, tenantSend, tenantSendVoid } from '../../../shared/api/tenantApi'
import { tenantKeys } from '../../../shared/api/tenantKeys'
import { tenantRequest } from '../../../shared/api/tenantRequest'
import { menuGroupSchema } from '../schemas'
import {
  groupPageSchema,
  imageUploadSchema,
  ingredientPageSchema,
  ingredientSchema,
  menuItemPageSchema,
  menuItemSchema,
  recipeCostEstimateSchema,
  recipePageSchema,
  recipeSchema,
  type GroupCriteria,
  type IngredientCriteria,
  type MenuItemCriteria,
} from '../adminSchemas'

const CODE = 'INVALID_MENU_RESPONSE'

/** Keys under `menu-admin`, separate from the POS menu cache (orderKeys.menus). */
export const menuKeys = {
  root: (scope: string | null) => tenantKeys.module(scope, 'menu-admin'),
  items: (scope: string | null) => [...menuKeys.root(scope), 'items'] as const,
  itemList: (scope: string | null, c: MenuItemCriteria) => [...menuKeys.items(scope), 'list', c] as const,
  item: (scope: string | null, id: string) => [...menuKeys.items(scope), 'detail', id] as const,
  groups: (scope: string | null) => [...menuKeys.root(scope), 'groups'] as const,
  groupList: (scope: string | null, c: GroupCriteria) => [...menuKeys.groups(scope), 'list', c] as const,
  groupOptions: (scope: string | null) => [...menuKeys.groups(scope), 'options'] as const,
  ingredients: (scope: string | null) => [...menuKeys.root(scope), 'ingredients'] as const,
  ingredientList: (scope: string | null, c: IngredientCriteria) => [...menuKeys.ingredients(scope), 'list', c] as const,
  ingredientSearch: (scope: string | null, q: string) => [...menuKeys.ingredients(scope), 'search', q] as const,
  recipes: (scope: string | null, itemId: string) => [...menuKeys.root(scope), 'recipes', itemId] as const,
  activeRecipe: (scope: string | null, itemId: string) => [...menuKeys.recipes(scope, itemId), 'active'] as const,
  recipeHistory: (scope: string | null, itemId: string, page: number) => [...menuKeys.recipes(scope, itemId), 'history', page] as const,
  recipe: (scope: string | null, itemId: string, recipeId: string) => [...menuKeys.recipes(scope, itemId), 'detail', recipeId] as const,
  estimate: (scope: string | null, itemId: string, recipeId: string) => [...menuKeys.recipes(scope, itemId), 'estimate', recipeId] as const,
}

const bool = (value: '' | 'true' | 'false') => (value === '' ? undefined : value === 'true')

export interface MenuItemCreate {
  groupId: string | null
  sku?: string
  name: string
  baseUnit: string
  description?: string
  imageUrl?: string
  salePrice: number
  costPrice?: number
  active: boolean
  trackInventory: boolean
  recipeEnabled: boolean
}
export type MenuItemPatch = Partial<{
  name: string
  sku: string
  baseUnit: string
  description: string
  imageUrl: string
  salePrice: number
  costPrice: number
  costConfigured: boolean
  trackInventory: boolean
  recipeEnabled: boolean
}>

export const menuAdminApi = {
  // ── Items ─────────────────────────────────────────────
  items: (scope: string, c: MenuItemCriteria, signal?: AbortSignal) =>
    tenantGet(scope, '/menu/items', menuItemPageSchema, {
      signal,
      code: CODE,
      params: {
        q: c.q,
        groupId: c.groupId,
        active: bool(c.active),
        availabilityStatus: c.availabilityStatus,
        page: c.page,
        size: 20,
        sortBy: c.sortBy,
        direction: c.direction,
      },
    }),
  item: (scope: string, id: string, signal?: AbortSignal) =>
    tenantGet(scope, `/menu/items/${enc(id)}`, menuItemSchema, { signal, code: CODE }),
  createItem: (scope: string, body: MenuItemCreate) => tenantSend(scope, 'post', '/menu/items', body, menuItemSchema, { code: CODE }),
  updateItem: (scope: string, id: string, expectedVersion: number, patch: MenuItemPatch) =>
    tenantSend(scope, 'patch', `/menu/items/${enc(id)}`, { ...patch, expectedVersion }, menuItemSchema, { code: CODE }),
  setItemActive: (scope: string, id: string, expectedVersion: number, active: boolean) =>
    tenantSend(scope, 'patch', `/menu/items/${enc(id)}/status`, { active, expectedVersion }, menuItemSchema, { code: CODE }),
  setAvailability: (scope: string, id: string, expectedVersion: number, availabilityStatus: 'AVAILABLE' | 'OUT_OF_STOCK') =>
    tenantSend(scope, 'patch', `/menu/items/${enc(id)}/availability`, { availabilityStatus, expectedVersion }, menuItemSchema, {
      code: CODE,
    }),
  /** groupId null removes the assignment. */
  setItemGroup: (scope: string, id: string, expectedVersion: number, groupId: string | null) =>
    tenantSend(scope, 'put', `/menu/items/${enc(id)}/group`, { groupId, expectedVersion }, menuItemSchema, { code: CODE }),
  deleteItem: (scope: string, id: string, expectedVersion: number) =>
    tenantSendVoid(scope, 'delete', `/menu/items/${enc(id)}`, { params: { expectedVersion } }),

  /** One JPG/PNG/WebP ≤ 5 MB; the returned URL is then saved as the item's imageUrl. */
  async uploadImage(scope: string, file: File) {
    const config = tenantRequest(scope)
    const form = new FormData()
    form.append('file', file)
    const response = await api.post<unknown>('/menu/images', form, { ...config, timeout: 60_000 })
    ensureRequestScope(config)
    return parseTenantResponse(imageUploadSchema, response.data, CODE)
  },

  // ── Groups ────────────────────────────────────────────
  groups: (scope: string, c: GroupCriteria, signal?: AbortSignal) =>
    tenantGet(scope, '/menu/groups', groupPageSchema, {
      signal,
      code: CODE,
      params: { q: c.gq, active: bool(c.gactive), page: c.gpage, size: 20, sortBy: 'displayOrder', direction: 'asc' },
    }),
  /** Every group, for selects and filters (a restaurant rarely has more than 100). */
  groupOptions: (scope: string, signal?: AbortSignal) =>
    tenantGet(scope, '/menu/groups', groupPageSchema, {
      signal,
      code: CODE,
      params: { page: 0, size: 100, sortBy: 'displayOrder', direction: 'asc' },
    }),
  createGroup: (scope: string, body: { name: string; displayOrder: number; active: boolean }) =>
    tenantSend(scope, 'post', '/menu/groups', body, menuGroupSchema, { code: CODE }),
  updateGroup: (scope: string, id: string, expectedVersion: number, body: { name?: string; displayOrder?: number }) =>
    tenantSend(scope, 'patch', `/menu/groups/${enc(id)}`, { ...body, expectedVersion }, menuGroupSchema, { code: CODE }),
  setGroupActive: (scope: string, id: string, expectedVersion: number, active: boolean) =>
    tenantSend(scope, 'patch', `/menu/groups/${enc(id)}/status`, { active, expectedVersion }, menuGroupSchema, { code: CODE }),
  deleteGroup: (scope: string, id: string, expectedVersion: number) =>
    tenantSendVoid(scope, 'delete', `/menu/groups/${enc(id)}`, { params: { expectedVersion } }),

  // ── Ingredients ───────────────────────────────────────
  ingredients: (scope: string, c: IngredientCriteria, signal?: AbortSignal) =>
    tenantGet(scope, '/menu/ingredients', ingredientPageSchema, {
      signal,
      code: CODE,
      params: {
        q: c.iq,
        active: bool(c.iactive),
        trackInventory: bool(c.itrack),
        page: c.ipage,
        size: 20,
        sortBy: c.isortBy,
        direction: c.idirection,
      },
    }),
  /** Active ingredients matching a search, for the recipe picker. */
  searchIngredients: (scope: string, q: string, signal?: AbortSignal) =>
    tenantGet(scope, '/menu/ingredients', ingredientPageSchema, {
      signal,
      code: CODE,
      params: { q, active: true, page: 0, size: 20, sortBy: 'name', direction: 'asc' },
    }),
  createIngredient: (scope: string, body: Record<string, unknown>) =>
    tenantSend(scope, 'post', '/menu/ingredients', body, ingredientSchema, { code: CODE }),
  updateIngredient: (scope: string, id: string, expectedVersion: number, patch: Record<string, unknown>) =>
    tenantSend(scope, 'patch', `/menu/ingredients/${enc(id)}`, { ...patch, expectedVersion }, ingredientSchema, { code: CODE }),
  setIngredientActive: (scope: string, id: string, expectedVersion: number, active: boolean) =>
    tenantSend(scope, 'patch', `/menu/ingredients/${enc(id)}/status`, { active, expectedVersion }, ingredientSchema, { code: CODE }),
  deleteIngredient: (scope: string, id: string, expectedVersion: number) =>
    tenantSendVoid(scope, 'delete', `/menu/ingredients/${enc(id)}`, { params: { expectedVersion } }),

  // ── Recipes ───────────────────────────────────────────
  activeRecipe: (scope: string, itemId: string, signal?: AbortSignal) =>
    tenantGetOptional(scope, `/menu/items/${enc(itemId)}/recipes/active`, recipeSchema, {
      signal,
      code: CODE,
      notFoundCodes: ['ACTIVE_RECIPE_NOT_FOUND', 'RECIPE_NOT_FOUND'],
    }),
  recipeHistory: (scope: string, itemId: string, page: number, signal?: AbortSignal) =>
    tenantGet(scope, `/menu/items/${enc(itemId)}/recipes`, recipePageSchema, {
      signal,
      code: CODE,
      params: { page, size: 10, sortBy: 'recipeVersion', direction: 'desc' },
    }),
  recipe: (scope: string, itemId: string, recipeId: string, signal?: AbortSignal) =>
    tenantGet(scope, `/menu/items/${enc(itemId)}/recipes/${enc(recipeId)}`, recipeSchema, { signal, code: CODE }),
  costEstimate: (scope: string, itemId: string, recipeId: string, signal?: AbortSignal) =>
    tenantGet(scope, `/menu/items/${enc(itemId)}/recipes/${enc(recipeId)}/cost-estimate`, recipeCostEstimateSchema, {
      signal,
      code: CODE,
    }),
  createRecipe: (scope: string, itemId: string, body: RecipeBody) =>
    tenantSend(scope, 'post', `/menu/items/${enc(itemId)}/recipes`, body, recipeSchema, { code: CODE }),
  /** Replaces the active version with a new immutable one (history is kept). */
  createRecipeVersion: (scope: string, itemId: string, activeRecipeId: string, expectedVersion: number, body: RecipeBody) =>
    tenantSend(scope, 'post', `/menu/items/${enc(itemId)}/recipes/${enc(activeRecipeId)}/versions`, { ...body, expectedVersion }, recipeSchema, {
      code: CODE,
    }),
  deactivateRecipe: (scope: string, itemId: string, recipeId: string, expectedVersion: number) =>
    tenantSendVoid(scope, 'delete', `/menu/items/${enc(itemId)}/recipes/${enc(recipeId)}`, { params: { expectedVersion } }),
}

export const recipeBodySchema = z.object({
  yieldQuantity: z.number(),
  ingredients: z.array(z.object({ ingredientId: z.string(), quantity: z.number(), wastePercent: z.number() })),
})
export type RecipeBody = z.infer<typeof recipeBodySchema>
