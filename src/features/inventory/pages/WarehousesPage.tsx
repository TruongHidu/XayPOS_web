import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { PageTitle, StatusBadge } from '../../../shared/ui/Display'
import { Drawer } from '../../../shared/ui/Drawer'
import { TextField } from '../../../shared/ui/FormFields'
import { Icon } from '../../../shared/ui/Icon'
import { MutationError } from '../../../shared/ui/MutationError'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { inventoryApi, inventoryKeys } from '../api/inventoryApi'
import { InventorySubNav } from '../components/InventoryCommon'
import { useWarehouses } from '../hooks/useWarehouses'
import { canInventory } from '../policies/inventoryAccessPolicy'
import type { Warehouse } from '../schemas'
import '../inventory.css'

const formSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Nhập mã kho.')
    .max(50, 'Tối đa 50 ký tự.')
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1, 'Nhập tên kho.').max(150, 'Tối đa 150 ký tự.'),
})
type Form = z.input<typeof formSchema>

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; warehouse: Warehouse }
  | { kind: 'toggle' | 'default' | 'delete'; warehouse: Warehouse }
  | null

/** Quản lý kho: the first warehouse becomes the default automatically. */
export function WarehousesPage() {
  const { access } = useTenantAccess()
  const warehouses = useWarehouses()
  const [dialog, setDialog] = useState<Dialog>(null)
  const canUpdate = canInventory(access, 'WAREHOUSE_UPDATE')
  const canDelete = canInventory(access, 'WAREHOUSE_DELETE')
  const invalidate = (s: string) => [inventoryKeys.root(s)]
  const action = useTenantMutation({
    mutationFn: async (s, d: { kind: 'toggle' | 'default' | 'delete'; warehouse: Warehouse }) => {
      if (d.kind === 'toggle') return inventoryApi.setWarehouseActive(s, d.warehouse.id, d.warehouse.version, !d.warehouse.active)
      if (d.kind === 'default') return inventoryApi.makeDefault(s, d.warehouse.id, d.warehouse.version)
      await inventoryApi.deleteWarehouse(s, d.warehouse.id, d.warehouse.version)
      return d.warehouse
    },
    invalidate,
    success: (_, d) =>
      d.kind === 'default' ? `${d.warehouse.name} là kho mặc định.` : d.kind === 'delete' ? 'Đã xóa kho.' : d.warehouse.active ? 'Đã tắt kho.' : 'Đã bật kho.',
    onSuccess: () => setDialog(null),
  })

  const columns: Column<Warehouse>[] = [
    { key: 'code', header: 'Mã kho', render: (w) => <strong>{w.code}</strong> },
    {
      key: 'name',
      header: 'Tên kho',
      render: (w) => (
        <>
          {w.name} {w.isDefault && <StatusBadge tone="primary">Mặc định</StatusBadge>}
        </>
      ),
    },
    { key: 'status', header: 'Trạng thái', render: (w) => <StatusBadge tone={w.active ? 'success' : 'neutral'}>{w.active ? 'Đang dùng' : 'Ngừng dùng'}</StatusBadge> },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (w) => (
        <div className="ui-inline-actions" onClick={(event) => event.stopPropagation()}>
          {canUpdate && !w.isDefault && w.active && (
            <button type="button" className="button button-small button-ghost" onClick={() => setDialog({ kind: 'default', warehouse: w })}>
              Đặt mặc định
            </button>
          )}
          {canUpdate && (
            <>
              {!w.isDefault && (
                <button type="button" className="button button-small button-ghost" onClick={() => setDialog({ kind: 'toggle', warehouse: w })}>
                  {w.active ? 'Tắt' : 'Bật'}
                </button>
              )}
              <button type="button" className="button button-small button-ghost" onClick={() => setDialog({ kind: 'edit', warehouse: w })}>
                Sửa
              </button>
            </>
          )}
          {canDelete && !w.isDefault && (
            <button type="button" className="ui-icon-button" aria-label={`Xóa kho ${w.name}`} onClick={() => setDialog({ kind: 'delete', warehouse: w })}>
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="ui-page">
      <InventorySubNav />
      <PageTitle
        title="Quản lý kho"
        description="Kho mặc định là nơi hệ thống giữ và trừ hàng khi bán món."
        actions={
          canInventory(access, 'WAREHOUSE_CREATE') ? (
            <button type="button" className="button button-primary" onClick={() => setDialog({ kind: 'create' })}>
              <Icon name="plus" size={16} /> Thêm kho
            </button>
          ) : null
        }
      />
      <DataTable
        caption="Danh sách kho"
        columns={columns}
        rows={warehouses.data}
        rowKey={(w) => w.id}
        loading={warehouses.isFetching}
        error={warehouses.error}
        onRetry={() => void warehouses.refetch()}
        empty={{ title: 'Chưa có kho nào', description: 'Tạo kho đầu tiên; kho này sẽ tự là kho mặc định.' }}
      />
      {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
        <WarehouseDrawer warehouse={dialog.kind === 'edit' ? dialog.warehouse : null} onClose={() => setDialog(null)} />
      )}
      {dialog && (dialog.kind === 'toggle' || dialog.kind === 'default' || dialog.kind === 'delete') && (
        <ConfirmDialog
          title={
            dialog.kind === 'default'
              ? `Đặt ${dialog.warehouse.name} làm kho mặc định?`
              : dialog.kind === 'delete'
                ? `Xóa kho ${dialog.warehouse.name}?`
                : `${dialog.warehouse.active ? 'Tắt' : 'Bật'} kho ${dialog.warehouse.name}?`
          }
          tone={dialog.kind === 'default' ? 'primary' : 'danger'}
          confirmLabel={dialog.kind === 'default' ? 'Đặt mặc định' : dialog.kind === 'delete' ? 'Xóa kho' : dialog.warehouse.active ? 'Tắt kho' : 'Bật kho'}
          message={
            dialog.kind === 'default'
              ? 'Đơn mới sẽ giữ và trừ hàng ở kho này. Hàng đang giữ cho đơn cũ vẫn ở kho cũ.'
              : 'Chỉ tắt/xóa được kho không còn tồn và không giữ hàng cho đơn nào. Mã kho không dùng lại được sau khi xóa.'
          }
          busy={action.isPending}
          error={action.error ? tenantError(action.error).message : null}
          onConfirm={() => action.mutate(dialog)}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  )
}

function WarehouseDrawer({ warehouse, onClose }: { warehouse: Warehouse | null; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(formSchema), defaultValues: { code: warehouse?.code ?? '', name: warehouse?.name ?? '' } })
  const save = useTenantMutation({
    mutationFn: (s, raw: Form) => {
      const v = formSchema.parse(raw)
      if (!warehouse) return inventoryApi.createWarehouse(s, v)
      const patch: { code?: string; name?: string } = {}
      if (v.code !== warehouse.code) patch.code = v.code
      if (v.name !== warehouse.name) patch.name = v.name
      return Object.keys(patch).length ? inventoryApi.updateWarehouse(s, warehouse.id, warehouse.version, patch) : Promise.resolve(warehouse)
    },
    invalidate: (s) => [inventoryKeys.warehouses(s)],
    success: warehouse ? 'Đã lưu kho.' : 'Đã thêm kho.',
    onSuccess: onClose,
  })
  return (
    <Drawer
      title={warehouse ? `Sửa kho ${warehouse.name}` : 'Thêm kho'}
      width="sm"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" form="warehouse-form" className="button button-primary" disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </button>
        </>
      }
    >
      <form id="warehouse-form" noValidate onSubmit={handleSubmit((values) => save.mutate(values))}>
        <TextField label="Mã kho" required placeholder="KHO-CHINH" hint="Tự viết hoa, không dùng lại được sau khi xóa." error={errors.code?.message} {...register('code')} />
        <TextField label="Tên kho" required placeholder="Kho chính" error={errors.name?.message} {...register('name')} />
        <MutationError error={save.error} />
      </form>
    </Drawer>
  )
}
