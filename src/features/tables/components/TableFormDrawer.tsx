import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { Drawer } from '../../../shared/ui/Drawer'
import { Notice } from '../../../shared/ui/Display'
import { Field, NumberInput, SelectField, Switch, TextField } from '../../../shared/ui/FormFields'
import { MutationError } from '../../../shared/ui/MutationError'
import { orderKeys } from '../../order/api/orderKeys'
import { tablesAdminApi, tableKeys } from '../api/tablesAdminApi'
import { tableFormSchema, type RestaurantTable, type TableArea, type TableForm } from '../schemas'

/** Create a table, or edit code/name/capacity/area/status of one. */
export function TableFormDrawer({
  table,
  areas,
  defaultAreaId,
  onClose,
  onReload,
}: {
  table: RestaurantTable | null
  areas: TableArea[]
  defaultAreaId?: string
  onClose: () => void
  onReload?: () => void
}) {
  const creating = table === null
  const occupied = !!table?.occupied
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<TableForm>({
    resolver: zodResolver(tableFormSchema),
    defaultValues: {
      code: table?.code ?? '',
      name: table?.name ?? '',
      areaId: table?.area?.id ?? defaultAreaId ?? '',
      capacity: table?.capacity ?? 4,
      displayOrder: table?.displayOrder ?? 0,
      active: table ? table.status === 'AVAILABLE' : true,
    },
  })
  const save = useTenantMutation({
    mutationFn: async (s, raw: TableForm) => {
      const v = tableFormSchema.parse(raw)
      const status = v.active ? ('AVAILABLE' as const) : ('INACTIVE' as const)
      if (!table)
        return tablesAdminApi.createTable(s, {
          areaId: v.areaId || null,
          code: v.code,
          name: v.name,
          capacity: v.capacity,
          displayOrder: v.displayOrder,
          status,
        })
      let current = table
      const patch: Partial<{ code: string; name: string; capacity: number; displayOrder: number }> = {}
      if (v.code !== current.code) patch.code = v.code
      if (v.name !== current.name) patch.name = v.name
      if (v.capacity !== current.capacity) patch.capacity = v.capacity
      if (v.displayOrder !== current.displayOrder) patch.displayOrder = v.displayOrder
      if (Object.keys(patch).length) current = await tablesAdminApi.updateTable(s, current.id, current.version, patch)
      if ((v.areaId || null) !== (current.area?.id ?? null)) current = await tablesAdminApi.setTableArea(s, current.id, current.version, v.areaId || null)
      if (status !== current.status) current = await tablesAdminApi.setTableStatus(s, current.id, current.version, status)
      return current
    },
    invalidate: (s) => [tableKeys.tables(s), orderKeys.tables(s), orderKeys.selectedTables(s)],
    success: creating ? 'Đã thêm bàn.' : 'Đã lưu bàn.',
    onSuccess: onClose,
  })
  const areaOptions = areas
    .filter((area) => area.active || area.id === table?.area?.id)
    .map((area) => ({ value: area.id, label: area.active ? area.name : `${area.name} (đang tắt)` }))
  return (
    <Drawer
      title={creating ? 'Thêm bàn' : `Sửa bàn ${table.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" form="table-form" className="button button-primary" disabled={save.isPending || (!creating && !isDirty)}>
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </button>
        </>
      }
    >
      <form id="table-form" noValidate onSubmit={handleSubmit((values) => save.mutate(values))}>
        {occupied && <Notice tone="warning">Bàn đang có khách: chỉ đổi được tên và thứ tự hiển thị.</Notice>}
        <div className="ui-form-grid">
          <TextField label="Mã bàn" required disabled={occupied} placeholder="B01" hint="In trên thẻ QR, tự viết hoa." error={errors.code?.message} {...register('code')} />
          <TextField label="Tên bàn" required placeholder="Bàn 01" error={errors.name?.message} {...register('name')} />
          <Controller
            control={control}
            name="capacity"
            render={({ field }) => (
              <Field label="Số chỗ" htmlFor="table-capacity" error={errors.capacity?.message} hint="Chỉ để tham khảo, có thể nhận nhiều khách hơn.">
                <NumberInput id="table-capacity" disabled={occupied} value={field.value} onChange={(value) => field.onChange(value ?? 0)} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="displayOrder"
            render={({ field }) => (
              <Field label="Thứ tự hiển thị" htmlFor="table-order" error={errors.displayOrder?.message}>
                <NumberInput id="table-order" value={field.value} onChange={(value) => field.onChange(value ?? 0)} />
              </Field>
            )}
          />
          <SelectField
            label="Khu vực"
            className="ui-span-2"
            disabled={occupied}
            placeholder="Không thuộc khu nào"
            options={areaOptions}
            error={errors.areaId?.message}
            {...register('areaId')}
          />
        </div>
        <Controller
          control={control}
          name="active"
          render={({ field }) => (
            <Switch
              checked={field.value}
              disabled={occupied}
              onChange={field.onChange}
              label="Đang dùng"
              description="Tắt để tạm ngưng nhận khách ở bàn này (sửa chữa, đặt riêng…)."
            />
          )}
        />
        <MutationError error={save.error} onReload={onReload} />
      </form>
    </Drawer>
  )
}
