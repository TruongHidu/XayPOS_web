import { z } from 'zod'

export const publicRestaurantSchema = z.object({
  name: z.string(),
  currencyCode: z.string(),
})

export const publicTableSchema = z.object({
  code: z.string(),
  name: z.string(),
})

export const publicMenuGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayOrder: z.number(),
})

export const publicQrMenuContextSchema = z.object({
  restaurant: publicRestaurantSchema,
  table: publicTableSchema,
  groups: z.array(publicMenuGroupSchema),
})

export const publicMenuItemGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export const publicMenuItemSchema = z.object({
  id: z.string(),
  group: publicMenuItemGroupSchema.nullable(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  baseUnit: z.string(),
  salePrice: z.number(),
  availabilityStatus: z.enum(['AVAILABLE', 'OUT_OF_STOCK']),
})

export const publicMenuPageSchema = z.object({
  content: z.array(publicMenuItemSchema),
  page: z.number(),
  size: z.number(),
  totalElements: z.number(),
  totalPages: z.number(),
})
