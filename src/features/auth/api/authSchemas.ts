import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email là bắt buộc.').email('Email không hợp lệ.').max(254, 'Email không được vượt quá 254 ký tự.'),
  password: z.string().min(1, 'Mật khẩu là bắt buộc.'),
})
export type LoginFormValues = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  restaurantName: z.string().trim().min(1, 'Tên nhà hàng là bắt buộc.').max(150, 'Tên nhà hàng không được vượt quá 150 ký tự.'),
  ownerName: z.string().trim().min(1, 'Họ tên là bắt buộc.').max(150, 'Họ tên không được vượt quá 150 ký tự.'),
  ownerEmail: z.string().trim().min(1, 'Email là bắt buộc.').email('Email không hợp lệ.').max(254, 'Email không được vượt quá 254 ký tự.'),
  ownerPhone: z.string().trim().max(30, 'Số điện thoại không được vượt quá 30 ký tự.'),
  password: z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự.').max(100, 'Mật khẩu không được vượt quá 100 ký tự.'),
})
export type RegisterFormValues = z.infer<typeof registerSchema>
