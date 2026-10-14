import { z } from 'zod'
import { moneyMinor, quantityMilli } from '../utils/scaledDecimal'
export const resourceId = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase())
export const versionSchema = z.number().int().nonnegative().refine(Number.isSafeInteger)
export const timestampSchema = z.iso.datetime({ offset: true })
export const moneySchema = z
  .number()
  .finite()
  .nonnegative()
  .max(999999999999.99)
  .refine((value) => {
    try {
      moneyMinor(value)
      return true
    } catch {
      return false
    }
  }, 'Giá không hợp lệ.')
export const quantitySchema = z
  .number()
  .finite()
  .min(0.001)
  .max(999999999.999)
  .refine((value) => {
    try {
      quantityMilli(value)
      return true
    } catch {
      return false
    }
  }, 'Số lượng tối đa 3 chữ số thập phân.')
export const guestSchema = z.number().int().min(1).max(32767)
export const pageSchema = <T extends z.ZodType>(item: T) =>
  z
    .object({
      content: z.array(item),
      page: versionSchema,
      size: z.number().int().min(1).max(100),
      totalElements: versionSchema,
      totalPages: versionSchema,
    })
    .refine((value) => value.content.length <= value.size, 'Invalid page size')
