import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { Drawer } from '../../../shared/ui/Drawer'
import { NumberInput, Field, Switch, TextField } from '../../../shared/ui/FormFields'
import { MutationError } from '../../../shared/ui/MutationError'
import { orderKeys } from '../../order/api/orderKeys'
import { menuAdminApi, menuKeys } from '../api/menuAdminApi'
import { menuGroupFormSchema, type MenuGroup, type MenuGroupForm } from '../adminSchemas'

export function GroupDrawer({ group, onClose, onReload }: { group: MenuGroup | null; onClose: () => void; onReload?: () => void }) {
  const creating = group === null
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<MenuGroupForm>({
    resolver: zodResolver(menuGroupFormSchema),
    defaultValues: { name: group?.name ?? '', displayOrder: group?.displayOrder ?? 0, active: group?.active ?? true },
  })
  const invalidate = (s: string) => [menuKeys.groups(s), menuKeys.items(s), orderKeys.groups(s), orderKeys.menus(s)]
  const save = useTenantMutation({
    mutationFn: async (s, values: MenuGroupForm) => {
      if (creating) return menuAdminApi.createGroup(s, values)
      let current = group
      const patch: { name?: string; displayOrder?: number } = {}
      if (values.name !== current.name) patch.name = values.name
      if (values.displayOrder !== current.displayOrder) patch.displayOrder = values.displayOrder
      if (Object.keys(patch).length) current = await menuAdminApi.updateGroup(s, current.id, current.version, patch)
      if (values.active !== current.active) current = await menuAdminApi.setGroupActive(s, current.id, current.version, values.active)
      return current
    },
    invalidate,
    success: creating ? 'Đã thêm nhóm món.' : 'Đã lưu nhóm món.',
    onSuccess: onClose,
  })
  return (
    <Drawer
      title={creating ? 'Thêm nhóm món' : `Sửa nhóm: ${group.name}`}
      width="sm"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" form="menu-group-form" className="button button-primary" disabled={save.isPending || (!creating && !isDirty)}>
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </button>
        </>
      }
    >
      <form id="menu-group-form" noValidate onSubmit={handleSubmit((values) => save.mutate(values))}>
        <TextField label="Tên nhóm" required placeholder="Đồ uống, Món chính…" error={errors.name?.message} {...register('name')} />
        <Controller
          control={control}
          name="displayOrder"
          render={({ field }) => (
            <Field label="Thứ tự hiển thị" hint="Số nhỏ hiện trước trên POS và menu QR." error={errors.displayOrder?.message} htmlFor="group-order">
              <NumberInput id="group-order" value={field.value} onChange={(value) => field.onChange(value ?? 0)} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="active"
          render={({ field }) => (
            <Switch checked={field.value} onChange={field.onChange} label="Đang dùng" description="Tắt nhóm sẽ tạm ẩn mọi món trong nhóm." />
          )}
        />
        <MutationError error={save.error} onReload={onReload} />
      </form>
    </Drawer>
  )
}
