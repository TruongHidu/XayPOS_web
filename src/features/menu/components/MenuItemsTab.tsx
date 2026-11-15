import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { StatusBadge } from '../../../shared/ui/Display'
import { FilterBar, FilterSelect } from '../../../shared/ui/FilterBar'
import { Icon } from '../../../shared/ui/Icon'
import { toast } from '../../../shared/ui/toast'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { formatVnd } from '../../../shared/utils/adminFormatting'
import { orderKeys } from '../../order/api/orderKeys'
import { menuAdminApi, menuKeys } from '../api/menuAdminApi'
import {
  inventoryModeOf,
  menuItemCriteriaDefaults,
  menuItemCriteriaSchema,
  type MenuItem,
  type MenuItemCriteria,
} from '../adminSchemas'
import { canMenuAction, canRecipe, canSetAvailability } from '../policies/menuAccessPolicy'
import { itemSaleState } from '../utils/menuLabels'
import { MenuItemDrawer } from './MenuItemDrawer'

type Dialog = { kind: 'create' } | { kind: 'edit'; item: MenuItem } | { kind: 'delete'; item: MenuItem } | null

export function MenuItemsTab() {
  const { access, scope } = useTenantAccess()
  const navigate = useNavigate()
  const { criteria, update, reset, isFiltered } = useUrlCriteria<MenuItemCriteria>(menuItemCriteriaSchema, menuItemCriteriaDefaults)
  const [dialog, setDialog] = useState<Dialog>(null)
  const query = useQuery({
    queryKey: menuKeys.itemList(scope, criteria),
    queryFn: ({ signal }) => menuAdminApi.items(scope!, criteria, signal),
    enabled: !!scope,
    placeholderData: keepPreviousData,
  })
  const groups = useQuery({
    queryKey: menuKeys.groupOptions(scope),
    queryFn: ({ signal }) => menuAdminApi.groupOptions(scope!, signal),
    enabled: !!scope,
    staleTime: 60_000,
  })
  const invalidate = (s: string) => [menuKeys.items(s), orderKeys.menus(s)]
  const availability = useTenantMutation({
    mutationFn: (s, item: MenuItem) =>
      menuAdminApi.setAvailability(s, item.id, item.version, item.availabilityStatus === 'AVAILABLE' ? 'OUT_OF_STOCK' : 'AVAILABLE'),
    invalidate,
    success: (updated) => (updated.availabilityStatus === 'AVAILABLE' ? `${updated.name}: còn món.` : `${updated.name}: đã báo hết món.`),
  })
  const remove = useTenantMutation({
    mutationFn: (s, item: MenuItem) => menuAdminApi.deleteItem(s, item.id, item.version),
    invalidate,
    success: 'Đã xóa món.',
    onSuccess: () => setDialog(null),
  })

  const canCreate = canMenuAction(access, 'MENU_CREATE')
  const canUpdate = canMenuAction(access, 'MENU_UPDATE')
  const canDelete = canMenuAction(access, 'MENU_DELETE')
  const canToggleAvailability = canSetAvailability(access)
  const canSeeRecipe = canRecipe(access, 'RECIPE_VIEW')

  const columns: Column<MenuItem>[] = [
    {
      key: 'name',
      header: 'Món',
      sortKey: 'name',
      render: (item) => (
        <div className="ui-row-with-thumb">
          {item.imageUrl ? (
            <img className="ui-thumb" src={item.imageUrl} alt="" loading="lazy" />
          ) : (
            <span className="ui-thumb">
              <Icon name="menu" size={18} />
            </span>
          )}
          <div className="ui-cell-title">
            <strong>{item.name}</strong>
            <span>
              {item.sku ? `${item.sku} · ` : ''}
              {item.baseUnit}
            </span>
          </div>
        </div>
      ),
    },
    { key: 'group', header: 'Nhóm', hideOnNarrow: true, render: (item) => item.group?.name ?? <span className="ui-muted-cell">Không nhóm</span> },
    { key: 'price', header: 'Giá bán', sortKey: 'salePrice', align: 'right', render: (item) => <strong>{formatVnd(item.salePrice)}</strong> },
    {
      key: 'cost',
      header: 'Giá vốn',
      align: 'right',
      hideOnNarrow: true,
      render: (item) =>
        item.costConfigured ? formatVnd(item.costPrice) : <span className="ui-muted-cell">Chưa cấu hình</span>,
    },
    {
      key: 'stock',
      header: 'Trừ kho',
      hideOnNarrow: true,
      render: (item) => {
        const mode = inventoryModeOf(item)
        return mode === 'NONE' ? (
          <span className="ui-muted-cell">Không</span>
        ) : (
          <StatusBadge tone="info">{mode === 'DIRECT' ? 'Trực tiếp' : 'Theo công thức'}</StatusBadge>
        )
      },
    },
    {
      key: 'state',
      header: 'Trạng thái',
      render: (item) => {
        const state = itemSaleState(item)
        return <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
      },
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (item) => (
        <div className="ui-inline-actions" onClick={(event) => event.stopPropagation()}>
          {canToggleAvailability && item.active && (
            <button
              type="button"
              className={item.availabilityStatus === 'AVAILABLE' ? 'button button-small button-ghost' : 'button button-small button-secondary'}
              disabled={availability.isPending && availability.variables?.id === item.id}
              onClick={() =>
                availability.mutate(item, { onError: (error) => toast.error(tenantError(error).message) })
              }
            >
              {item.availabilityStatus === 'AVAILABLE' ? 'Báo hết' : 'Còn món'}
            </button>
          )}
          {canSeeRecipe && (
            <button
              type="button"
              className="button button-small button-ghost"
              onClick={() => navigate(`/app/menu/items/${encodeURIComponent(item.id)}/recipes`)}
            >
              Công thức
            </button>
          )}
          {canUpdate && (
            <button type="button" className="button button-small button-ghost" onClick={() => setDialog({ kind: 'edit', item })}>
              Sửa
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="ui-icon-button"
              aria-label={`Xóa ${item.name}`}
              title="Xóa món"
              onClick={() => setDialog({ kind: 'delete', item })}
            >
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="ui-section-stack">
      <FilterBar
        search={criteria.q}
        onSearch={(q) => update({ q })}
        searchPlaceholder="Tìm theo tên hoặc SKU"
        isFiltered={isFiltered}
        onReset={reset}
        actions={
          canCreate ? (
            <button type="button" className="button button-primary" onClick={() => setDialog({ kind: 'create' })}>
              <Icon name="plus" size={16} /> Thêm món
            </button>
          ) : null
        }
      >
        <FilterSelect
          label="Nhóm"
          value={criteria.groupId}
          options={[{ value: '', label: 'Tất cả nhóm' }, ...(groups.data?.content ?? []).map((g) => ({ value: g.id, label: g.name }))]}
          onChange={(groupId) => update({ groupId })}
        />
        <FilterSelect
          label="Còn/hết"
          value={criteria.availabilityStatus}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'AVAILABLE', label: 'Còn món' },
            { value: 'OUT_OF_STOCK', label: 'Hết món' },
          ]}
          onChange={(availabilityStatus) => update({ availabilityStatus })}
        />
        <FilterSelect
          label="Bán"
          value={criteria.active}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'true', label: 'Đang bán' },
            { value: 'false', label: 'Ngừng bán' },
          ]}
          onChange={(active) => update({ active })}
        />
      </FilterBar>
      <DataTable
        caption="Danh sách món"
        columns={columns}
        rows={query.data?.content}
        rowKey={(item) => item.id}
        loading={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        onRowClick={canUpdate ? (item) => setDialog({ kind: 'edit', item }) : undefined}
        empty={
          isFiltered
            ? { title: 'Không có món phù hợp', description: 'Thử đổi từ khóa hoặc bộ lọc.' }
            : { title: 'Chưa có món nào', description: 'Thêm món đầu tiên để bắt đầu bán hàng.' }
        }
        sort={{ by: criteria.sortBy, direction: criteria.direction }}
        onSort={(sort) => update({ sortBy: sort.by as MenuItemCriteria['sortBy'], direction: sort.direction })}
        page={criteria.page}
        totalPages={query.data?.totalPages ?? 0}
        onPageChange={(page) => update({ page })}
      />
      {dialog?.kind === 'create' && <MenuItemDrawer item={null} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && (
        <MenuItemDrawer item={dialog.item} onClose={() => setDialog(null)} onReload={() => void query.refetch().then(() => setDialog(null))} />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Xóa món ${dialog.item.name}?`}
          tone="danger"
          confirmLabel="Xóa món"
          message="Món sẽ biến mất khỏi thực đơn và màn hình gọi món. Lịch sử đơn hàng vẫn giữ nguyên. Món còn công thức hoặc tồn kho cần xử lý trước."
          busy={remove.isPending}
          error={remove.error ? tenantError(remove.error).message : null}
          onConfirm={() => remove.mutate(dialog.item)}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  )
}
