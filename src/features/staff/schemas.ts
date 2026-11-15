import { z } from 'zod'
import { pageSchema, resourceId, timestampSchema } from '../../shared/api/tenantSchemas'

export const staffRoleSchema = z.object({ id: resourceId, code: z.string(), name: z.string() })
export type StaffRole = z.infer<typeof staffRoleSchema>

export const staffMemberSchema = z.object({
  id: resourceId,
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  active: z.boolean(),
  role: staffRoleSchema,
  lastLoginAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type StaffMember = z.infer<typeof staffMemberSchema>
export const staffPageSchema = pageSchema(staffMemberSchema)
export const staffRolesSchema = z.array(staffRoleSchema)

export const permissionCatalogSchema = z.array(
  z.object({ code: z.string(), module: z.string(), name: z.string(), description: z.string().nullable() }),
)
export type PermissionCatalogItem = z.infer<typeof permissionCatalogSchema>[number]

export const staffPermissionsSchema = z.object({
  staffId: resourceId,
  roleCode: z.string(),
  rolePermissions: z.array(z.string()),
  grants: z.array(z.string()),
  denies: z.array(z.string()),
  effectivePermissions: z.array(z.string()),
})
export type StaffPermissions = z.infer<typeof staffPermissionsSchema>

export const staffSortFields = ['createdAt', 'name', 'email', 'lastLoginAt'] as const
export const staffCriteriaSchema = z.object({
  q: z.string().max(100),
  roleCode: z.string().max(30),
  active: z.enum(['', 'true', 'false']),
  page: z.number().int().min(0),
  sortBy: z.enum(staffSortFields),
  direction: z.enum(['asc', 'desc']),
})
export type StaffCriteria = z.infer<typeof staffCriteriaSchema>
export const staffCriteriaDefaults: StaffCriteria = { q: '', roleCode: '', active: '', page: 0, sortBy: 'createdAt', direction: 'desc' }

const phone = z
  .string()
  .trim()
  .max(30, 'Tối đa 30 ký tự.')
  .refine((value) => value === '' || /^[0-9+().\s-]{6,30}$/.test(value), 'Số điện thoại chưa đúng định dạng.')

export const staffCreateSchema = z.object({
  name: z.string().trim().min(1, 'Nhập họ tên.').max(100, 'Tối đa 100 ký tự.'),
  email: z.string().trim().toLowerCase().email('Email chưa đúng định dạng.').max(255),
  phone,
  roleCode: z.string().min(1, 'Chọn vai trò.'),
  initialPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự.').max(100, 'Tối đa 100 ký tự.'),
})
export type StaffCreateForm = z.infer<typeof staffCreateSchema>

export const staffUpdateSchema = staffCreateSchema.omit({ initialPassword: true })
export type StaffUpdateForm = z.infer<typeof staffUpdateSchema>
