import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { Drawer } from '../../../shared/ui/Drawer'
import { Notice } from '../../../shared/ui/Display'
import { SelectField, TextField } from '../../../shared/ui/FormFields'
import { MutationError } from '../../../shared/ui/MutationError'
import { roleLabel } from '../../../shared/utils/roleLabels'
import type { UserRole } from '../../../shared/types/auth'
import { staffApi, staffKeys } from '../api/staffApi'
import { canAssignStaffRole } from '../policies/staffAccessPolicy'
import { staffCreateSchema, staffUpdateSchema, type StaffCreateForm, type StaffMember, type StaffUpdateForm } from '../schemas'

/** Create a staff account, or edit name/email/phone/role of an existing one. */
export function StaffFormDrawer({ member, onClose }: { member: StaffMember | null; onClose: () => void }) {
  const { access, scope } = useTenantAccess()
  const roles = useQuery({
    queryKey: staffKeys.roles(scope),
    queryFn: ({ signal }) => staffApi.roles(scope!, signal),
    enabled: !!scope,
    staleTime: 5 * 60_000,
  })
  const roleOptions = (roles.data ?? [])
    .filter((role) => canAssignStaffRole(access, role.code) || role.code === member?.role.code)
    .map((role) => ({ value: role.code, label: roleLabel(role.code as UserRole) || role.name }))

  const editing = member !== null
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<StaffCreateForm>({
    resolver: zodResolver(editing ? (staffUpdateSchema as unknown as typeof staffCreateSchema) : staffCreateSchema),
    defaultValues: {
      name: member?.name ?? '',
      email: member?.email ?? '',
      phone: member?.phone ?? '',
      roleCode: member?.role.code ?? '',
      initialPassword: '',
    },
  })

  const create = useTenantMutation({
    mutationFn: (s, form: StaffCreateForm) => staffApi.create(s, form),
    invalidate: (s) => [staffKeys.lists(s)],
    success: (created) => `Đã thêm nhân viên ${created.name}.`,
    onSuccess: onClose,
  })
  const update = useTenantMutation({
    mutationFn: (s, form: Partial<StaffUpdateForm>) => staffApi.update(s, member!.id, form),
    invalidate: (s) => [staffKeys.lists(s), staffKeys.permissions(s, member!.id)],
    success: 'Đã lưu thông tin nhân viên.',
    onSuccess: onClose,
  })
  const mutation = editing ? update : create

  const submit = (values: StaffCreateForm) => {
    if (!editing) return create.mutate(values)
    // PATCH only what changed: an unchanged role must not reset permission overrides.
    const changes: Partial<StaffUpdateForm> = {}
    if (values.name !== member.name) changes.name = values.name
    if (values.email !== member.email) changes.email = values.email
    if ((values.phone || '') !== (member.phone ?? '')) changes.phone = values.phone
    if (values.roleCode !== member.role.code) changes.roleCode = values.roleCode
    if (Object.keys(changes).length === 0) return onClose()
    update.mutate(changes)
  }

  return (
    <Drawer
      title={editing ? `Sửa nhân viên: ${member.name}` : 'Thêm nhân viên'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" form="staff-form" className="button button-primary" disabled={mutation.isPending || (editing && !isDirty)}>
            {mutation.isPending ? 'Đang lưu…' : editing ? 'Lưu' : 'Thêm nhân viên'}
          </button>
        </>
      }
    >
      <form id="staff-form" noValidate onSubmit={handleSubmit(submit)}>
        <TextField label="Họ tên" required error={errors.name?.message} {...register('name')} />
        <TextField label="Email đăng nhập" required type="email" autoComplete="off" error={errors.email?.message} {...register('email')} />
        <TextField label="Điện thoại" inputMode="tel" error={errors.phone?.message} {...register('phone')} />
        <SelectField
          label="Vai trò"
          required
          placeholder={roles.isLoading ? 'Đang tải vai trò…' : 'Chọn vai trò'}
          options={roleOptions}
          error={errors.roleCode?.message}
          {...register('roleCode')}
        />
        {!editing && (
          <TextField
            label="Mật khẩu ban đầu"
            required
            type="password"
            autoComplete="new-password"
            hint="Tối thiểu 8 ký tự. Gửi riêng cho nhân viên; hệ thống không hiển thị lại mật khẩu này."
            error={errors.initialPassword?.message}
            {...register('initialPassword')}
          />
        )}
        {editing && (
          <Notice tone="info">
            Đổi vai trò sẽ xóa các quyền đã chỉnh riêng cho nhân viên này. Đổi email hoặc vai trò sẽ đăng xuất nhân viên khỏi
            các thiết bị.
          </Notice>
        )}
        <MutationError error={mutation.error} />
      </form>
    </Drawer>
  )
}
