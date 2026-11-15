import { z } from 'zod'
import { moneySchema, pageSchema, resourceId, timestampSchema, versionSchema } from '../../shared/api/tenantSchemas'
import { menuGroupSchema, privateMenuItemSchema } from './schemas'

// Schemas for the menu management screens (MENU_*/INGREDIENT_*/RECIPE_*).
// `schemas.ts` keeps the read-only shapes the POS uses.

export const inventoryModes = ['NONE', 'DIRECT', 'RECIPE'] as const
export type InventoryMode = (typeof inventoryModes)[number]

/** Private item plus the stock fields (V40; absent on older servers). */
export const menuItemSchema = privateMenuItemSchema.extend({
  trackInventory: z.boolean().optional(),
  inventoryMode: z.enum(inventoryModes).optional(),
})
export type MenuItem = z.infer<typeof menuItemSchema>
export const menuItemPageSchema = pageSchema(menuItemSchema)
export type MenuGroup = z.infer<typeof menuGroupSchema>
export const groupPageSchema = pageSchema(menuGroupSchema)

/** NONE / DIRECT / RECIPE from the flags (inventoryMode is read-only and may be missing). */
export const inventoryModeOf = (item: Pick<MenuItem, 'inventoryMode' | 'trackInventory' | 'recipeEnabled'>): InventoryMode =>
  item.inventoryMode ?? (item.recipeEnabled ? 'RECIPE' : item.trackInventory ? 'DIRECT' : 'NONE')

/** Request flags for a mode (both true is INVENTORY_TRACKING_MODE_CONFLICT). */
export const inventoryModeFlags = (mode: InventoryMode) => ({
  trackInventory: mode === 'DIRECT',
  recipeEnabled: mode === 'RECIPE',
})

export const ingredientSchema = z.object({
  id: resourceId,
  sku: z.string().nullable(),
  name: z.string().min(1),
  baseUnit: z.string().min(1),
  description: z.string().nullable(),
  costPrice: moneySchema,
  costConfigured: z.boolean(),
  trackInventory: z.boolean(),
  active: z.boolean(),
  version: versionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type Ingredient = z.infer<typeof ingredientSchema>
export const ingredientPageSchema = pageSchema(ingredientSchema)

export const imageUploadSchema = z.object({ url: z.string().url() })

const optionalText = (max: number, message: string) => z.string().trim().max(max, message)
const money = z.number({ error: 'Nhập số tiền hợp lệ.' }).min(0, 'Không được âm.').max(999999999999.99, 'Số tiền quá lớn.')
const costRule = {
  path: ['costPrice'],
  message: 'Nhập giá vốn tham chiếu, hoặc bỏ chọn "Đã xác định giá vốn".',
}

export const menuItemFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Nhập tên món.').max(150, 'Tối đa 150 ký tự.'),
    sku: optionalText(80, 'Tối đa 80 ký tự.'),
    baseUnit: z.string().trim().min(1, 'Nhập đơn vị bán (ví dụ: tô, ly, phần).').max(30, 'Tối đa 30 ký tự.'),
    groupId: z.string(),
    salePrice: money.nullable(),
    description: optionalText(10000, 'Mô tả quá dài.'),
    imageUrl: z.string().max(500),
    costConfigured: z.boolean(),
    costPrice: money.nullable(),
    active: z.boolean(),
    inventoryMode: z.enum(inventoryModes),
  })
  .refine((value) => value.salePrice !== null, { path: ['salePrice'], message: 'Nhập giá bán.' })
  .refine((value) => !value.costConfigured || value.costPrice !== null, costRule)
export type MenuItemForm = z.infer<typeof menuItemFormSchema>

export const menuGroupFormSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên nhóm.').max(100, 'Tối đa 100 ký tự.'),
  displayOrder: z.number({ error: 'Nhập số thứ tự.' }).int('Nhập số nguyên.').min(0, 'Không được âm.'),
  active: z.boolean(),
})
export type MenuGroupForm = z.infer<typeof menuGroupFormSchema>

export const ingredientFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Nhập tên nguyên liệu.').max(150, 'Tối đa 150 ký tự.'),
    sku: optionalText(80, 'Tối đa 80 ký tự.'),
    baseUnit: z.string().trim().min(1, 'Nhập đơn vị gốc (ví dụ: g, ml, cái).').max(30, 'Tối đa 30 ký tự.'),
    description: optionalText(10000, 'Mô tả quá dài.'),
    costConfigured: z.boolean(),
    costPrice: money.nullable(),
    trackInventory: z.boolean(),
    active: z.boolean(),
  })
  .refine((value) => !value.costConfigured || value.costPrice !== null, costRule)
export type IngredientForm = z.infer<typeof ingredientFormSchema>

const boolFilter = z.enum(['', 'true', 'false'])

export const menuItemCriteriaSchema = z.object({
  q: z.string().max(100),
  groupId: z.string().max(40),
  active: boolFilter,
  availabilityStatus: z.enum(['', 'AVAILABLE', 'OUT_OF_STOCK']),
  page: z.number().int().min(0),
  sortBy: z.enum(['createdAt', 'name', 'salePrice', 'updatedAt']),
  direction: z.enum(['asc', 'desc']),
})
export type MenuItemCriteria = z.infer<typeof menuItemCriteriaSchema>
export const menuItemCriteriaDefaults: MenuItemCriteria = {
  q: '',
  groupId: '',
  active: '',
  availabilityStatus: '',
  page: 0,
  sortBy: 'name',
  direction: 'asc',
}

export const groupCriteriaSchema = z.object({
  gq: z.string().max(100),
  gactive: boolFilter,
  gpage: z.number().int().min(0),
})
export type GroupCriteria = z.infer<typeof groupCriteriaSchema>
export const groupCriteriaDefaults: GroupCriteria = { gq: '', gactive: '', gpage: 0 }

export const ingredientCriteriaSchema = z.object({
  iq: z.string().max(100),
  iactive: boolFilter,
  itrack: boolFilter,
  ipage: z.number().int().min(0),
  isortBy: z.enum(['createdAt', 'updatedAt', 'name', 'sku', 'costPrice']),
  idirection: z.enum(['asc', 'desc']),
})
export type IngredientCriteria = z.infer<typeof ingredientCriteriaSchema>
export const ingredientCriteriaDefaults: IngredientCriteria = {
  iq: '',
  iactive: '',
  itrack: '',
  ipage: 0,
  isortBy: 'name',
  idirection: 'asc',
}

// ── Recipes ──────────────────────────────────────────────────────────────────

const positiveDecimal = z.number().positive()
export const recipeSchema = z.object({
  id: resourceId,
  menuItemId: resourceId,
  recipeVersion: z.number().int().positive(),
  yieldQuantity: positiveDecimal,
  yieldUnit: z.string(),
  active: z.boolean(),
  ingredients: z.array(
    z.object({
      id: resourceId,
      ingredientId: resourceId,
      sku: z.string().nullable(),
      name: z.string(),
      unit: z.string(),
      quantity: positiveDecimal,
      wastePercent: z.number().min(0).max(100),
    }),
  ),
  version: versionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type Recipe = z.infer<typeof recipeSchema>

export const recipeSummarySchema = z.object({
  id: resourceId,
  recipeVersion: z.number().int().positive(),
  yieldQuantity: positiveDecimal,
  yieldUnit: z.string(),
  active: z.boolean(),
  ingredientCount: z.number().int().nonnegative().optional(),
  version: versionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type RecipeSummary = z.infer<typeof recipeSummarySchema>
export const recipePageSchema = pageSchema(recipeSummarySchema)

export const recipeCostEstimateSchema = z.object({
  menuItemId: resourceId,
  recipeId: resourceId,
  recipeVersion: z.number().int().positive(),
  recipeActive: z.boolean(),
  yieldQuantity: positiveDecimal,
  yieldUnit: z.string(),
  currencyCode: z.string(),
  costSource: z.string(),
  totalBatchCost: z.number().nonnegative(),
  costPerYieldUnit: z.number().nonnegative(),
  ingredients: z.array(
    z.object({
      ingredientId: resourceId,
      sku: z.string().nullable(),
      name: z.string(),
      unit: z.string(),
      quantity: z.number(),
      wastePercent: z.number(),
      grossQuantity: z.number(),
      unitCost: z.number(),
      lineCost: z.number(),
    }),
  ),
  warnings: z.array(z.object({ code: z.string(), ingredientId: resourceId.nullable().optional(), message: z.string() })),
  estimatedAt: timestampSchema,
})
export type RecipeCostEstimate = z.infer<typeof recipeCostEstimateSchema>

const threeDecimals = (value: number) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6
const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6

export const recipeFormSchema = z.object({
  yieldQuantity: z
    .number({ error: 'Nhập sản lượng.' })
    .positive('Sản lượng phải lớn hơn 0.')
    .refine(threeDecimals, 'Tối đa 3 chữ số thập phân.'),
  ingredients: z
    .array(
      z.object({
        ingredientId: z.string().min(1, 'Chọn nguyên liệu.'),
        name: z.string(),
        unit: z.string(),
        quantity: z
          .number({ error: 'Nhập định lượng.' })
          .positive('Định lượng phải lớn hơn 0.')
          .refine(threeDecimals, 'Tối đa 3 chữ số thập phân.'),
        wastePercent: z
          .number({ error: 'Nhập hao hụt.' })
          .min(0, 'Từ 0 đến 100%.')
          .max(100, 'Từ 0 đến 100%.')
          .refine(twoDecimals, 'Tối đa 2 chữ số thập phân.'),
      }),
    )
    .min(1, 'Thêm ít nhất một nguyên liệu.')
    .max(100, 'Tối đa 100 nguyên liệu.')
    .refine((lines) => new Set(lines.map((line) => line.ingredientId)).size === lines.length, 'Mỗi nguyên liệu chỉ thêm một lần.'),
})
export type RecipeForm = z.infer<typeof recipeFormSchema>
