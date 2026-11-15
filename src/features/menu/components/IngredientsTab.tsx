import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
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
import { menuAdminApi, menuKeys } from '../api/menuAdminApi'
import { ingredientCriteriaDefaults, ingredientCriteriaSchema, type Ingredient, type IngredientCriteria } from '../adminSchemas'
import { canIngredient } from '../policies/menuAccessPolicy'
import { IngredientDrawer } from './IngredientDrawer'

type Dialog = { kind: 'create' } | { kind: 'edit'; ingredient: Ingredient } | { kind: 'delete'; ingredient: Ingredient } | null

export function IngredientsTab() {
  const { access, scope } = useTenantAccess()
  const { criteria, update, reset, isFiltered } = useUrlCriteria<IngredientCriteria>(ingredientCriteriaSchema, ingredientCriteriaDefaults)
  const [dialog, setDialog] = useState<Dialog>(null)
  const query = useQuery({
    queryKey: menuKeys.ingredientList(scope, criteria),
    queryFn: ({ signal }) => menuAdminApi.ingredients(scope!, criteria, signal),
    enabled: !!scope,
    placeholderData: keepPreviousData,
  })
  const toggle = useTenantMutation({
    mutationFn: (s, i: Ingredient) => menuAdminApi.setIngredientActive(s, i.id, i.version, !i.active),
    invalidate: (s) => [menuKeys.ingredients(s)],
    success: (i) => (i.active ? `Đã bật ${i.name}.` : `Đã tắt ${i.name}.`),
  })
  const remove = useTenantMutation({
    mutationFn: (s, i: Ingredient) => menuAdminApi.deleteIngredient(s, i.id, i.version),
    invalidate: (s) => [menuKeys.ingredients(s)],
    success: 'Đã xóa nguyên liệu.',
    onSuccess: () => setDialog(null),
  })
  const canUpdate = canIngredient(access, 'INGREDIENT_UPDATE')
  const canDelete = canIngredient(access, 'INGREDIENT_DELETE')

  const columns: Column<Ingredient>[] = [
    {
      key: 'name',
      header: 'Nguyên liệu',
      sortKey: 'name',
      render: (i) => (
        <div className="ui-cell-title">
          <strong>{i.name}</strong>
          <span>{i.sku ?? 'Không có SKU'}</span>
        </div>
      ),
    },
    { key: 'unit', header: 'Đơn vị gốc', render: (i) => i.baseUnit },
    {
      key: 'cost',
      header: 'Giá vốn / đơn vị',
      sortKey: 'costPrice',
      align: 'right',
      render: (i) => (i.costConfigured ? `${formatVnd(i.costPrice)}/${i.baseUnit}` : <span className="ui-muted-cell">Chưa cấu hình</span>),
    },
    {
      key: 'track',
      header: 'Theo dõi kho',
      hideOnNarrow: true,
      render: (i) => (i.trackInventory ? <StatusBadge tone="info">Có</StatusBadge> : <span className="ui-muted-cell">Không</span>),
    },
    { key: 'status', header: 'Trạng thái', render: (i) => <StatusBadge tone={i.active ? 'success' : 'neutral'}>{i.active ? 'Đang dùng' : 'Đang tắt'}</StatusBadge> },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (i) => (
        <div className="ui-inline-actions" onClick={(event) => event.stopPropagation()}>
          {canUpdate && (
            <>
              <button
                type="button"
                className="button button-small button-ghost"
                disabled={toggle.isPending && toggle.variables?.id === i.id}
                onClick={() => toggle.mutate(i, { onError: (error) => toast.error(tenantError(error).message) })}
              >
                {i.active ? 'Tắt' : 'Bật'}
              </button>
              <button type="button" className="button button-small button-ghost" onClick={() => setDialog({ kind: 'edit', ingredient: i })}>
                Sửa
              </button>
            </>
          )}
          {canDelete && (
            <button type="button" className="ui-icon-button" aria-label={`Xóa ${i.name}`} onClick={() => setDialog({ kind: 'delete', ingredient: i })}>
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
        search={criteria.iq}
        onSearch={(iq) => update({ iq })}
        searchPlaceholder="Tìm theo tên hoặc SKU"
        isFiltered={isFiltered}
        onReset={reset}
        actions={
          canIngredient(access, 'INGREDIENT_CREATE') ? (
            <button type="button" className="button button-primary" onClick={() => setDialog({ kind: 'create' })}>
              <Icon name="plus" size={16} /> Thêm nguyên liệu
            </button>
          ) : null
        }
      >
        <FilterSelect
          label="Trạng thái"
          value={criteria.iactive}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'true', label: 'Đang dùng' },
            { value: 'false', label: 'Đang tắt' },
          ]}
          onChange={(iactive) => update({ iactive })}
        />
        <FilterSelect
          label="Theo dõi kho"
          value={criteria.itrack}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'true', label: 'Có' },
            { value: 'false', label: 'Không' },
          ]}
          onChange={(itrack) => update({ itrack })}
        />
      </FilterBar>
      <DataTable
        caption="Nguyên liệu"
        columns={columns}
        rows={query.data?.content}
        rowKey={(i) => i.id}
        loading={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        onRowClick={canUpdate ? (ingredient) => setDialog({ kind: 'edit', ingredient }) : undefined}
        empty={
          isFiltered
            ? { title: 'Không có nguyên liệu phù hợp', description: 'Thử đổi từ khóa hoặc bộ lọc.' }
            : { title: 'Chưa có nguyên liệu', description: 'Nguyên liệu dùng cho công thức món và quản lý kho.' }
        }
        sort={{ by: criteria.isortBy, direction: criteria.idirection }}
        onSort={(sort) => update({ isortBy: sort.by as IngredientCriteria['isortBy'], idirection: sort.direction })}
        page={criteria.ipage}
        totalPages={query.data?.totalPages ?? 0}
        onPageChange={(ipage) => update({ ipage })}
      />
      {dialog?.kind === 'create' && <IngredientDrawer ingredient={null} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && (
        <IngredientDrawer ingredient={dialog.ingredient} onClose={() => setDialog(null)} onReload={() => void query.refetch().then(() => setDialog(null))} />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Xóa nguyên liệu ${dialog.ingredient.name}?`}
          tone="danger"
          confirmLabel="Xóa"
          message="Không xóa được nguyên liệu đang dùng trong công thức của món. Lịch sử công thức cũ vẫn được giữ."
          busy={remove.isPending}
          error={remove.error ? tenantError(remove.error).message : null}
          onConfirm={() => remove.mutate(dialog.ingredient)}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  )
}
