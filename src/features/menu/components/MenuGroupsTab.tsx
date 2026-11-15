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
import { orderKeys } from '../../order/api/orderKeys'
import { menuAdminApi, menuKeys } from '../api/menuAdminApi'
import { groupCriteriaDefaults, groupCriteriaSchema, type GroupCriteria, type MenuGroup } from '../adminSchemas'
import { canMenuAction } from '../policies/menuAccessPolicy'
import { GroupDrawer } from './GroupDrawer'

type Dialog = { kind: 'create' } | { kind: 'edit'; group: MenuGroup } | { kind: 'delete'; group: MenuGroup } | null

export function MenuGroupsTab() {
  const { access, scope } = useTenantAccess()
  const { criteria, update, reset, isFiltered } = useUrlCriteria<GroupCriteria>(groupCriteriaSchema, groupCriteriaDefaults)
  const [dialog, setDialog] = useState<Dialog>(null)
  const query = useQuery({
    queryKey: menuKeys.groupList(scope, criteria),
    queryFn: ({ signal }) => menuAdminApi.groups(scope!, criteria, signal),
    enabled: !!scope,
    placeholderData: keepPreviousData,
  })
  const invalidate = (s: string) => [menuKeys.groups(s), menuKeys.items(s), orderKeys.groups(s), orderKeys.menus(s)]
  const toggle = useTenantMutation({
    mutationFn: (s, group: MenuGroup) => menuAdminApi.setGroupActive(s, group.id, group.version, !group.active),
    invalidate,
    success: (group) => (group.active ? `Đã bật nhóm ${group.name}.` : `Đã tắt nhóm ${group.name}; các món trong nhóm tạm ẩn.`),
  })
  const remove = useTenantMutation({
    mutationFn: (s, group: MenuGroup) => menuAdminApi.deleteGroup(s, group.id, group.version),
    invalidate,
    success: 'Đã xóa nhóm món.',
    onSuccess: () => setDialog(null),
  })
  const canUpdate = canMenuAction(access, 'MENU_UPDATE')
  const canDelete = canMenuAction(access, 'MENU_DELETE')

  const columns: Column<MenuGroup>[] = [
    { key: 'order', header: 'Thứ tự', width: '90px', render: (g) => g.displayOrder },
    { key: 'name', header: 'Tên nhóm', render: (g) => <strong>{g.name}</strong> },
    { key: 'status', header: 'Trạng thái', render: (g) => <StatusBadge tone={g.active ? 'success' : 'neutral'}>{g.active ? 'Đang dùng' : 'Đang tắt'}</StatusBadge> },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (g) => (
        <div className="ui-inline-actions" onClick={(event) => event.stopPropagation()}>
          {canUpdate && (
            <>
              <button
                type="button"
                className="button button-small button-ghost"
                disabled={toggle.isPending && toggle.variables?.id === g.id}
                onClick={() => toggle.mutate(g, { onError: (error) => toast.error(tenantError(error).message) })}
              >
                {g.active ? 'Tắt' : 'Bật'}
              </button>
              <button type="button" className="button button-small button-ghost" onClick={() => setDialog({ kind: 'edit', group: g })}>
                Sửa
              </button>
            </>
          )}
          {canDelete && (
            <button type="button" className="ui-icon-button" aria-label={`Xóa nhóm ${g.name}`} onClick={() => setDialog({ kind: 'delete', group: g })}>
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
        search={criteria.gq}
        onSearch={(gq) => update({ gq })}
        searchPlaceholder="Tìm nhóm"
        isFiltered={isFiltered}
        onReset={reset}
        actions={
          canMenuAction(access, 'MENU_CREATE') ? (
            <button type="button" className="button button-primary" onClick={() => setDialog({ kind: 'create' })}>
              <Icon name="plus" size={16} /> Thêm nhóm
            </button>
          ) : null
        }
      >
        <FilterSelect
          label="Trạng thái"
          value={criteria.gactive}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'true', label: 'Đang dùng' },
            { value: 'false', label: 'Đang tắt' },
          ]}
          onChange={(gactive) => update({ gactive })}
        />
      </FilterBar>
      <DataTable
        caption="Nhóm món"
        columns={columns}
        rows={query.data?.content}
        rowKey={(g) => g.id}
        loading={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        onRowClick={canUpdate ? (group) => setDialog({ kind: 'edit', group }) : undefined}
        empty={{ title: 'Chưa có nhóm món', description: 'Nhóm giúp sắp xếp món trên POS và menu QR (Đồ uống, Món chính…).' }}
        page={criteria.gpage}
        totalPages={query.data?.totalPages ?? 0}
        onPageChange={(gpage) => update({ gpage })}
      />
      {dialog?.kind === 'create' && <GroupDrawer group={null} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && <GroupDrawer group={dialog.group} onClose={() => setDialog(null)} onReload={() => void query.refetch().then(() => setDialog(null))} />}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Xóa nhóm ${dialog.group.name}?`}
          tone="danger"
          confirmLabel="Xóa nhóm"
          message="Chỉ xóa được nhóm không còn món nào (kể cả món đang ngừng bán)."
          busy={remove.isPending}
          error={remove.error ? tenantError(remove.error).message : null}
          onConfirm={() => remove.mutate(dialog.group)}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  )
}
