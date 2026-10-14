import type { z } from 'zod'
import type {
  addItemsSchema,
  cancelSchema,
  createLineSchema,
  createOrderSchema,
  orderCriteriaSchema,
  orderLineSchema,
  orderSchema,
  orderSummarySchema,
  serviceTypeSchema,
  updateLineSchema,
  updateOrderSchema,
} from './schemas'
export type ServiceType = z.infer<typeof serviceTypeSchema>
export type Order = z.infer<typeof orderSchema>
export type OrderLine = z.infer<typeof orderLineSchema>
export type OrderSummary = z.infer<typeof orderSummarySchema>
export type OrderCriteria = z.infer<typeof orderCriteriaSchema>
export type CreateOrderInput = z.infer<typeof createOrderSchema>
export type CreateLine = z.infer<typeof createLineSchema>
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>
export type UpdateLineInput = z.infer<typeof updateLineSchema>
export type AddItemsInput = z.infer<typeof addItemsSchema>
export type CancelInput = z.infer<typeof cancelSchema>
export interface ServiceContext {
  serviceType: ServiceType
  tableSessionId: string | null
  tableId?: string
  activeOrderId?: string
  guestCount: number
  tableName?: string
}
