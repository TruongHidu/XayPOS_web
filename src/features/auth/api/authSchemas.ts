import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email là bắt buộc.').email('Email không hợp lệ.').max(254, 'Email không được vượt quá 254 ký tự.'),
  password: z.string().min(1, 'Mật khẩu là bắt buộc.'),
})
export type LoginFormValues = z.infer<typeof loginSchema>
