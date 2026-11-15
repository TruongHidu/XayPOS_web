import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Drawer } from '../../../shared/ui/Drawer'
import { StatusBadge } from '../../../shared/ui/Display'
import { Field, NumberInput, Switch, TextField } from '../../../shared/ui/FormFields'
import { Icon } from '../../../shared/ui/Icon'
import { MutationError } from '../../../shared/ui/MutationError'
import { toast } from '../../../shared/ui/toast'
import { EmptyState } from '../../../shared/components/AdminUi'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { orderKeys } from '../../order/api/orderKeys'
import { tablesAdminApi, tableKeys } from '../api/tablesAdminApi'
import { canTable } from '../policies/tableAccessPolicy'
import { areaFormSchema, type AreaForm, type TableArea } from '../schemas'

type Editing = { area: TableArea | null } | null

/** Khu vực (Tầng 1, Sân vườn…): list with create/edit/enable/delete in one panel. */
export function AreasDrawer({ areas, tableCounts, onClose }: { areas: TableArea[]; tableCounts: Map<string, number>; onClose: () => void }) {
  const { access } = useTenantAccess()
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<TableArea | null>(null)
  const invalidate = (s: string) => [tableKeys.root(s), orderKeys.areas(s), orderKeys.tables(s)]
  const toggle = useTenantMutation({
    mutationFn: (s, area: TableArea) => tablesAdminApi.setAreaActive(s, area.id, area.version, !area.active),
    invalidate,
    success: (area) => (area.active ? `Đã bật khu ${area.name}.` : `Đã tắt khu ${area.name}.`),
  })
  const remove = useTenantMutation({
    mutationFn: (s, area: TableArea) => tablesAdminApi.deleteArea(s, area.id, area.version),
    invalidate,
    success: 'Đã xóa khu vực.',
    onSuccess: () => setDeleting(null),
  })
  const canCreate = canTable(access, 'TABLE_CREATE')
  const canUpdate = canTable(access, 'TABLE_UPDATE')
  return (
    <Drawer title="Khu vực" subtitle="Chia bàn theo tầng hoặc khu để dễ tìm khi phục vụ." onClose={onClose}>
      {editing ? (
        <AreaForm area={editing.area} onDone={() => setEditing(null)} />
      ) : (
        <div className="ui-section-stack">
          {canCreate && (
            <div>
              <button type="button" className="button button-primary" onClick={() => setEditing({ area: null })}>
                <Icon name="plus" size={16} /> Thêm khu vực
              </button>
            </div>
          )}
          {areas.length === 0 ? (
            <EmptyState title="Chưa có khu vực" description="Bàn không thuộc khu nào vẫn dùng bình thường." />
          ) : (
            <ul className="tables-area-list">
              {areas.map((area) => (
                <li key={area.id}>
                  <div>
                    <strong>{area.name}</strong>
                    <span className="ui-muted-cell">
                      {tableCounts.get(area.id) ?? 0} bàn{area.description ? ` · ${area.description}` : ''}
                    </span>
                  </div>
                  <StatusBadge tone={area.active ? 'success' : 'neutral'}>{area.active ? 'Đang dùng' : 'Đang tắt'}</StatusBadge>
                  {canUpdate && (
                    <div className="ui-inline-actions">
                      <button
                        type="button"
                        className="button button-small button-ghost"
                        disabled={toggle.isPending}
                        onClick={() => toggle.mutate(area, { onError: (error) => toast.error(tenantError(error).message) })}
                      >
                        {area.active ? 'Tắt' : 'Bật'}
                      </button>
                      <button type="button" className="button button-small button-ghost" onClick={() => setEditing({ area })}>
                        Sửa
                      </button>
                      <button type="button" className="ui-icon-button" aria-label={`Xóa khu ${area.name}`} onClick={() => setDeleting(area)}>
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {deleting && (
        <ConfirmDialog
          title={`Xóa khu ${deleting.name}?`}
          tone="danger"
          confirmLabel="Xóa khu vực"
          message="Chỉ xóa được khu không còn bàn nào. Hãy chuyển bàn sang khu khác trước."
          busy={remove.isPending}
          error={remove.error ? tenantError(remove.error).message : null}
          onConfirm={() => remove.mutate(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Drawer>
  )
}

function AreaForm({ area, onDone }: { area: TableArea | null; onDone: () => void }) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AreaForm>({
    resolver: zodResolver(areaFormSchema),
    defaultValues: { name: area?.name ?? '', description: area?.description ?? '', displayOrder: area?.displayOrder ?? 0, active: area?.active ?? true },
  })
  const save = useTenantMutation({
    mutationFn: async (s, v: AreaForm) => {
      if (!area) return tablesAdminApi.createArea(s, { name: v.name, description: v.description || undefined, displayOrder: v.displayOrder, active: v.active })
      let current = area
      const patch: { name?: string; description?: string; displayOrder?: number } = {}
      if (v.name !== current.name) patch.name = v.name
      if (v.description !== (current.description ?? '')) patch.description = v.description
      if (v.displayOrder !== current.displayOrder) patch.displayOrder = v.displayOrder
      if (Object.keys(patch).length) current = await tablesAdminApi.updateArea(s, current.id, current.version, patch)
      if (v.active !== current.active) current = await tablesAdminApi.setAreaActive(s, current.id, current.version, v.active)
      return current
    },
    invalidate: (s) => [tableKeys.root(s), orderKeys.areas(s), orderKeys.tables(s)],
    success: area ? 'Đã lưu khu vực.' : 'Đã thêm khu vực.',
    onSuccess: onDone,
  })
  return (
    <form noValidate onSubmit={handleSubmit((values) => save.mutate(values))}>
      <h3 style={{ marginTop: 0 }}>{area ? `Sửa khu ${area.name}` : 'Thêm khu vực'}</h3>
      <TextField label="Tên khu vực" required placeholder="Tầng 1, Sân vườn…" error={errors.name?.message} {...register('name')} />
      <TextField label="Mô tả" error={errors.description?.message} {...register('description')} />
      <Controller
        control={control}
        name="displayOrder"
        render={({ field }) => (
          <Field label="Thứ tự hiển thị" htmlFor="area-order" error={errors.displayOrder?.message}>
            <NumberInput id="area-order" value={field.value} onChange={(value) => field.onChange(value ?? 0)} />
          </Field>
        )}
      />
      <Controller control={control} name="active" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Đang dùng" />} />
      <MutationError error={save.error} />
      <div className="ui-inline-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
        <button type="submit" className="button button-primary" disabled={save.isPending}>
          {save.isPending ? 'Đang lưu…' : 'Lưu'}
        </button>
        <button type="button" className="button button-ghost" onClick={onDone}>
          Quay lại
        </button>
      </div>
    </form>
  )
}
