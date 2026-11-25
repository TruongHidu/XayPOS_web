import { z } from 'zod'
import { resourceId, timestampSchema } from '../../shared/api/tenantSchemas'

/** GET/PATCH /restaurants/me */
export const restaurantProfileSchema = z.object({
  id: resourceId,
  code: z.string(),
  name: z.string(),
  legalName: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  timezone: z.string(),
  currencyCode: z.string(),
  status: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type RestaurantProfile = z.infer<typeof restaurantProfileSchema>

export const profileFormSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên nhà hàng.').max(150, 'Tối đa 150 ký tự.'),
  legalName: z.string().trim().max(255, 'Tối đa 255 ký tự.'),
  phone: z
    .string()
    .trim()
    .max(30, 'Tối đa 30 ký tự.')
    .refine((value) => value === '' || /^[0-9+().\s-]{6,30}$/.test(value), 'Số điện thoại chưa đúng định dạng.'),
  address: z.string().trim().max(500, 'Tối đa 500 ký tự.'),
})
export type ProfileForm = z.infer<typeof profileFormSchema>

/** /restaurants/me/menu-link — the restaurant-wide takeaway menu link. */
export const menuLinkSchema = z.object({
  menuToken: z.string().min(1),
  menuPath: z.string().min(1),
  menuUrl: z.string().nullable().optional(),
})
export type MenuLink = z.infer<typeof menuLinkSchema>

/** /restaurants/me/qr-ordering: per-channel QR ordering switches (PUT always sends both). */
export const qrOrderingSchema = z.object({ tableEnabled: z.boolean(), takeawayEnabled: z.boolean() })
export type QrOrdering = z.infer<typeof qrOrderingSchema>

/** /restaurants/me/transfer-account — `{configured:false}` when none. */
export const transferAccountSchema = z.union([
  z.object({ configured: z.literal(false) }),
  z.object({
    configured: z.literal(true),
    bankBin: z.string().regex(/^\d{6}$/),
    accountNumber: z.string().min(1),
    accountName: z.string().min(1),
    updatedAt: timestampSchema.nullable().optional(),
  }),
])
export type TransferAccountResponse = z.infer<typeof transferAccountSchema>
export type TransferAccount = Extract<TransferAccountResponse, { configured: true }>

export const transferAccountFormSchema = z.object({
  bankBin: z.string().regex(/^\d{6}$/, 'Hãy chọn ngân hàng.'),
  accountNumber: z
    .string()
    .transform((value) => value.replace(/\s+/g, '').toUpperCase())
    .pipe(
      z
        .string()
        .min(1, 'Nhập số tài khoản.')
        .max(19, 'Số tài khoản tối đa 19 ký tự.')
        .regex(/^[A-Z0-9]+$/, 'Số tài khoản chỉ gồm chữ số và chữ cái.'),
    ),
  accountName: z
    .string()
    .transform(normalizeAccountName)
    .pipe(
      z
        .string()
        .min(1, 'Nhập tên chủ tài khoản.')
        .max(50, 'Tên chủ tài khoản tối đa 50 ký tự.')
        .regex(/^[A-Z0-9 .,'-]+$/, 'Tên chủ tài khoản chỉ gồm chữ cái không dấu, chữ số và khoảng trắng.'),
    ),
})
export type TransferAccountForm = z.input<typeof transferAccountFormSchema>

/** `Nguyễn  Văn Đức` → `NGUYEN VAN DUC` (how banks print the holder name; VietQR needs ASCII). */
export function normalizeAccountName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
}
