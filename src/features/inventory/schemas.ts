import { z } from 'zod'
import { pageSchema, versionSchema } from '../../shared/api/tenantSchemas'

// Inventory DTOs (XayPOS_be/docs/inventory-api.md, stock-audit-api.md,
// low-stock-alert-api.md, direct-stock-menu-items-fe-sync.md).
// V40: rows carry itemId/itemType; ingredientId stays for INGREDIENT and is
// null for a direct-stock MENU_ITEM. The web identifies rows by `stockItemId()`.

const uuid = z.string().uuid()
const qty = z.number()
const itemType = z.enum(['INGREDIENT', 'MENU_ITEM']).optional()
const stamp = z.string()

export const stockItemId = (row: { itemId?: string | null; ingredientId?: string | null }) => row.itemId ?? row.ingredientId ?? ''

export const warehouseSchema = z.object({
  id: uuid,
  code: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  active: z.boolean(),
  version: versionSchema,
  createdAt: stamp,
  updatedAt: stamp,
})
export type Warehouse = z.infer<typeof warehouseSchema>
export const warehousePageSchema = pageSchema(warehouseSchema)

export const balanceSchema = z.object({
  balanceId: uuid.nullable(),
  configured: z.boolean().optional(),
  warehouseId: uuid,
  warehouseCode: z.string().optional(),
  itemId: uuid.optional(),
  itemType,
  ingredientId: uuid.nullable(),
  ingredientSku: z.string().nullable().optional(),
  ingredientName: z.string(),
  baseUnit: z.string(),
  ingredientActive: z.boolean(),
  quantity: qty,
  reservedQuantity: qty,
  availableQuantity: qty,
  minQuantity: qty,
  lowStock: z.boolean(),
  version: versionSchema.nullable(),
  createdAt: stamp.nullable().optional(),
  updatedAt: stamp.nullable().optional(),
})
export type Balance = z.infer<typeof balanceSchema>
export const balancePageSchema = pageSchema(balanceSchema)

export const stockItemSchema = z.object({
  itemId: uuid,
  itemType: z.enum(['INGREDIENT', 'MENU_ITEM']),
  sku: z.string().nullable(),
  name: z.string(),
  baseUnit: z.string(),
  active: z.boolean(),
})
export type StockItem = z.infer<typeof stockItemSchema>
export const stockItemPageSchema = pageSchema(stockItemSchema)

export const documentTypes = ['RECEIPT', 'ISSUE', 'ADJUSTMENT'] as const
export type DocumentType = (typeof documentTypes)[number]
export const documentStatuses = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const

export const documentItemSchema = z.object({
  id: uuid,
  itemId: uuid.optional(),
  itemType,
  ingredientId: uuid.nullable(),
  ingredientSku: z.string().nullable().optional(),
  ingredientName: z.string(),
  unit: z.string(),
  quantity: qty,
  adjustmentDirection: z.enum(['INCREASE', 'DECREASE']).nullable().optional(),
  unitCost: z.number(),
  totalCost: z.number(),
  note: z.string().nullable().optional(),
})
export type DocumentItem = z.infer<typeof documentItemSchema>

export const documentSummarySchema = z.object({
  id: uuid,
  documentCode: z.string(),
  documentType: z.enum(documentTypes),
  status: z.enum(documentStatuses),
  warehouseId: uuid,
  warehouseCode: z.string(),
  warehouseName: z.string(),
  note: z.string().nullable().optional(),
  lineCount: z.number().int().nonnegative(),
  totalQuantity: qty,
  totalCost: z.number(),
  createdBy: z.string().optional(),
  version: versionSchema,
  createdAt: stamp,
  updatedAt: stamp,
  stockAuditId: uuid.nullable().optional(),
  currencyCode: z.string().nullable().optional(),
})
export type DocumentSummary = z.infer<typeof documentSummarySchema>
export const documentDetailSchema = documentSummarySchema.extend({
  items: z.array(documentItemSchema),
  confirmedAt: stamp.nullable().optional(),
  cancelledAt: stamp.nullable().optional(),
})
export type DocumentDetail = z.infer<typeof documentDetailSchema>
export const documentPageSchema = pageSchema(documentSummarySchema)

export const transactionTypes = ['RECEIPT', 'ISSUE', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE', 'RECIPE_USE', 'DIRECT_USE'] as const
export const transactionSchema = z.object({
  transactionId: uuid,
  sourceType: z.string(),
  orderId: uuid.nullable().optional(),
  orderItemId: uuid.nullable().optional(),
  warehouseId: uuid,
  warehouseCode: z.string(),
  itemId: uuid.optional(),
  itemType,
  ingredientId: uuid.nullable(),
  ingredientSku: z.string().nullable().optional(),
  ingredientName: z.string(),
  unit: z.string(),
  stockDocumentId: uuid.nullable(),
  documentCode: z.string().nullable(),
  documentType: z.string().nullable(),
  transactionType: z.string(),
  quantityChange: qty,
  beforeQuantity: qty,
  afterQuantity: qty,
  unitCost: z.number().nullable(),
  createdBy: z.string().nullable().optional(),
  createdAt: stamp,
})
export type InventoryTransaction = z.infer<typeof transactionSchema>
export const transactionPageSchema = pageSchema(transactionSchema)

export const alertSchema = z.object({
  id: uuid,
  warehouseId: uuid,
  warehouseCode: z.string(),
  warehouseName: z.string(),
  itemId: uuid.optional(),
  itemType,
  ingredientId: uuid.nullable(),
  ingredientSku: z.string().nullable().optional(),
  ingredientName: z.string(),
  unit: z.string(),
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']),
  quantityAtTrigger: qty,
  thresholdQuantity: qty,
  currentQuantity: qty.nullable().optional(),
  reservedQuantity: qty.nullable().optional(),
  availableQuantity: qty.nullable().optional(),
  currentMinQuantity: qty.nullable().optional(),
  triggeredAt: stamp,
  acknowledgedBy: z.string().nullable().optional(),
  acknowledgedAt: stamp.nullable().optional(),
  resolvedAt: stamp.nullable().optional(),
  resolutionReason: z.string().nullable().optional(),
  version: versionSchema,
  createdAt: stamp,
  updatedAt: stamp,
})
export type LowStockAlert = z.infer<typeof alertSchema>
export const alertPageSchema = pageSchema(alertSchema)

export const auditStatuses = ['DRAFT', 'COUNTING', 'CONFIRMED', 'CANCELLED'] as const
export const auditSummarySchema = z.object({
  id: uuid,
  auditCode: z.string(),
  warehouseId: uuid,
  warehouseCode: z.string(),
  warehouseName: z.string(),
  status: z.enum(auditStatuses),
  note: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
  countedItemCount: z.number().int().nonnegative(),
  changedItemCount: z.number().int().nonnegative(),
  adjustmentDocumentId: uuid.nullable(),
  adjustmentDocumentCode: z.string().nullable(),
  version: versionSchema,
  createdAt: stamp,
  startedAt: stamp.nullable(),
  updatedAt: stamp,
})
export type AuditSummary = z.infer<typeof auditSummarySchema>
export const auditDetailSchema = auditSummarySchema.extend({
  confirmedAt: stamp.nullable().optional(),
  cancelledAt: stamp.nullable().optional(),
})
export type AuditDetail = z.infer<typeof auditDetailSchema>
export const auditPageSchema = pageSchema(auditSummarySchema)
export const auditItemSchema = z.object({
  id: uuid,
  itemId: uuid.optional(),
  itemType,
  ingredientId: uuid.nullable(),
  sku: z.string().nullable(),
  name: z.string(),
  unit: z.string(),
  systemQuantity: qty,
  countedQuantity: qty.nullable(),
  differenceQuantity: qty.nullable(),
  referenceUnitCostSnapshot: z.number(),
  note: z.string().nullable(),
})
export type AuditItem = z.infer<typeof auditItemSchema>
// Count sheets page by 100 rows (the batch limit), more than pageSchema's guard allows to skip.
export const auditItemPageSchema = pageSchema(auditItemSchema)

// ── URL criteria ─────────────────────────────────────────────────────────────

const bool = z.enum(['', 'true', 'false'])
export const balanceCriteriaSchema = z.object({
  warehouseId: z.string(),
  q: z.string().max(100),
  active: bool,
  low: bool,
  page: z.number().int().min(0),
  sortBy: z.enum(['ingredientName', 'sku', 'quantity', 'minQuantity', 'updatedAt']),
  direction: z.enum(['asc', 'desc']),
})
export type BalanceCriteria = z.infer<typeof balanceCriteriaSchema>
export const balanceDefaults: BalanceCriteria = { warehouseId: '', q: '', active: '', low: '', page: 0, sortBy: 'ingredientName', direction: 'asc' }

export const documentCriteriaSchema = z.object({
  q: z.string().max(100),
  type: z.enum(['', ...documentTypes]),
  status: z.enum(['', ...documentStatuses]),
  warehouseId: z.string(),
  from: z.string(),
  to: z.string(),
  page: z.number().int().min(0),
})
export type DocumentCriteria = z.infer<typeof documentCriteriaSchema>
export const documentDefaults: DocumentCriteria = { q: '', type: '', status: '', warehouseId: '', from: '', to: '', page: 0 }

export const transactionCriteriaSchema = z.object({
  warehouseId: z.string(),
  ingredientId: z.string(),
  documentId: z.string(),
  orderId: z.string(),
  transactionType: z.enum(['', ...transactionTypes]),
  from: z.string(),
  to: z.string(),
  page: z.number().int().min(0),
})
export type TransactionCriteria = z.infer<typeof transactionCriteriaSchema>
export const transactionDefaults: TransactionCriteria = {
  warehouseId: '',
  ingredientId: '',
  documentId: '',
  orderId: '',
  transactionType: '',
  from: '',
  to: '',
  page: 0,
}

export const alertCriteriaSchema = z.object({
  status: z.enum(['', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED']),
  warehouseId: z.string(),
  q: z.string().max(100),
  page: z.number().int().min(0),
})
export type AlertCriteria = z.infer<typeof alertCriteriaSchema>
export const alertDefaults: AlertCriteria = { status: 'OPEN', warehouseId: '', q: '', page: 0 }

export const auditCriteriaSchema = z.object({
  status: z.enum(['', ...auditStatuses]),
  warehouseId: z.string(),
  q: z.string().max(100),
  page: z.number().int().min(0),
})
export type AuditCriteria = z.infer<typeof auditCriteriaSchema>
export const auditDefaults: AuditCriteria = { status: '', warehouseId: '', q: '', page: 0 }

export const auditItemCriteriaSchema = z.object({
  iq: z.string().max(100),
  counted: bool,
  diff: bool,
  ipage: z.number().int().min(0),
})
export type AuditItemCriteria = z.infer<typeof auditItemCriteriaSchema>
export const auditItemDefaults: AuditItemCriteria = { iq: '', counted: '', diff: '', ipage: 0 }
