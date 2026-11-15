import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { PageTitle, StatusBadge } from '../../../shared/ui/Display'
import { FilterBar, FilterSelect } from '../../../shared/ui/FilterBar'
import { Icon } from '../../../shared/ui/Icon'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { roleLabel } from '../../../shared/utils/roleLabels'
import { useAuthStore } from '../../auth/store/authStore'
import type { UserRole } from '../../../shared/types/auth'
import { staffApi, staffKeys } from '../api/staffApi'
import { StaffFormDrawer } from '../components/StaffFormDrawer'
import { StaffPermissionsDrawer } from '../components/StaffPermissionsDrawer'
import { canManageStaff, canStaff } from '../policies/staffAccessPolicy'
import { staffCriteriaDefaults, staffCriteriaSchema, type StaffCriteria, type StaffMember } from '../schemas'
import '../staff.css'

const roleFilter: Array<{ value: string; label: string }> = [
  { value: '', label: 'Tất cả vai trò' },
  ...(['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'] as UserRole[]).map((role) => ({ value: role, label: roleLabel(role) })),
]

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; member: StaffMember }
  | { kind: 'permissions'; member: StaffMember }
  | { kind: 'status'; member: StaffMember }
  | null

export function StaffPage() {
  const { access, scope } = useTenantAccess()
  const maxStaff = useAuthStore((state) => state.entitlement?.maxStaff)
  const { criteria, update, reset, isFiltered } = useUrlCriteria<StaffCriteria>(staffCriteriaSchema, staffCriteriaDefaults)
  const [dialog, setDialog] = useState<Dialog>(null)
  const query = useQuery({
    queryKey: staffKeys.list(scope, criteria),
    queryFn: ({ signal }) => staffApi.list(scope!, criteria, signal),
    enabled: !!scope,
    placeholderData: keepPreviousData,
  })

  const canCreate = canStaff(access, 'STAFF_CREATE')
  const canPermissions = canStaff(access, 'STAFF_PERMISSION_MANAGE')

  const columns: Column<StaffMember>[] = [
    {
      key: 'name',
      header: 'Nhân viên',
      sortKey: 'name',
      render: (m) => (
        <div className="ui-row-with-thumb">
          <span className="staff-avatar" aria-hidden="true">
            {m.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="ui-cell-title">
            <strong>
              {m.name}
              {m.id === access.user?.id ? ' (bạn)' : ''}
            </strong>
            <span>{m.email}</span>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Điện thoại', hideOnNarrow: true, render: (m) => m.phone || <span className="ui-muted-cell">—</span> },
    {
      key: 'role',
      header: 'Vai trò',
      render: (m) => <StatusBadge tone={m.role.code === 'OWNER' ? 'primary' : 'info'}>{roleLabel(m.role.code as UserRole) || m.role.name}</StatusBadge>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (m) => <StatusBadge tone={m.active ? 'success' : 'neutral'}>{m.active ? 'Đang làm' : 'Đã khóa'}</StatusBadge>,
    },
    {
      key: 'lastLoginAt',
      header: 'Đăng nhập gần nhất',
      sortKey: 'lastLoginAt',
      hideOnNarrow: true,
      render: (m) => (m.lastLoginAt ? formatDateTimeVi(m.lastLoginAt) : <span className="ui-muted-cell">Chưa đăng nhập</span>),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (m) => {
        const canEdit = canManageStaff(access, 'STAFF_UPDATE', m.id, m.role.code)
        const canToggle = canManageStaff(access, 'STAFF_DISABLE', m.id, m.role.code)
        const canGrant = canPermissions && canManageStaff(access, 'STAFF_PERMISSION_MANAGE', m.id, m.role.code)
        if (!canEdit && !canToggle && !canGrant) return <span className="ui-muted-cell">—</span>
        return (
          <div className="ui-inline-actions" onClick={(event) => event.stopPropagation()}>
            {canEdit && (
              <button type="button" className="button button-small button-ghost" onClick={() => setDialog({ kind: 'edit', member: m })}>
                Sửa
              </button>
            )}
            {canGrant && (
              <button
                type="button"
                className="button button-small button-ghost"
                onClick={() => setDialog({ kind: 'permissions', member: m })}
              >
                Phân quyền
              </button>
            )}
            {canToggle && (
              <button
                type="button"
                className={m.active ? 'button button-small button-danger' : 'button button-small button-secondary'}
                onClick={() => setDialog({ kind: 'status', member: m })}
              >
                {m.active ? 'Khóa' : 'Mở khóa'}
              </button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="ui-page">
      <PageTitle
        title="Nhân viên"
        description={
          maxStaff
            ? `Gói hiện tại cho phép tối đa ${maxStaff} nhân viên đang làm (không tính chủ quán).`
            : 'Quản lý tài khoản, vai trò và quyền của nhân viên.'
        }
        actions={
          canCreate ? (
            <button type="button" className="button button-primary" onClick={() => setDialog({ kind: 'create' })}>
              <Icon name="plus" size={16} /> Thêm nhân viên
            </button>
          ) : null
        }
      />
      <FilterBar
        search={criteria.q}
        onSearch={(q) => update({ q })}
        searchPlaceholder="Tìm theo tên, email, điện thoại"
        isFiltered={isFiltered}
        onReset={reset}
      >
        <FilterSelect label="Vai trò" value={criteria.roleCode} options={roleFilter} onChange={(roleCode) => update({ roleCode })} />
        <FilterSelect
          label="Trạng thái"
          value={criteria.active}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'true', label: 'Đang làm' },
            { value: 'false', label: 'Đã khóa' },
          ]}
          onChange={(active) => update({ active })}
        />
      </FilterBar>
      <DataTable
        caption="Danh sách nhân viên"
        columns={columns}
        rows={query.data?.content}
        rowKey={(m) => m.id}
        loading={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={
          isFiltered
            ? { title: 'Không có nhân viên phù hợp', description: 'Thử đổi từ khóa hoặc bộ lọc.' }
            : { title: 'Chưa có nhân viên', description: 'Thêm nhân viên để phân công gọi món, bếp và thu ngân.' }
        }
        sort={{ by: criteria.sortBy, direction: criteria.direction }}
        onSort={(sort) => update({ sortBy: sort.by as StaffCriteria['sortBy'], direction: sort.direction })}
        page={criteria.page}
        totalPages={query.data?.totalPages ?? 0}
        onPageChange={(page) => update({ page })}
      />
      {dialog?.kind === 'create' && <StaffFormDrawer member={null} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && <StaffFormDrawer member={dialog.member} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'permissions' && <StaffPermissionsDrawer member={dialog.member} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'status' && <StatusDialog member={dialog.member} onClose={() => setDialog(null)} />}
    </div>
  )
}

function StatusDialog({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const disabling = member.active
  const mutation = useTenantMutation({
    mutationFn: (s, reason: string) => staffApi.setStatus(s, member.id, !disabling, reason || undefined),
    invalidate: (s) => [staffKeys.lists(s)],
    success: disabling ? `Đã khóa tài khoản ${member.name}.` : `Đã mở khóa tài khoản ${member.name}.`,
    onSuccess: onClose,
  })
  return (
    <ConfirmDialog
      title={disabling ? `Khóa tài khoản ${member.name}?` : `Mở khóa tài khoản ${member.name}?`}
      tone={disabling ? 'danger' : 'primary'}
      confirmLabel={disabling ? 'Khóa tài khoản' : 'Mở khóa'}
      message={
        disabling
          ? 'Nhân viên bị đăng xuất và không đăng nhập được nữa. Dữ liệu và lịch sử vẫn được giữ.'
          : 'Nhân viên đăng nhập lại được bằng mật khẩu cũ. Việc mở khóa tính vào số nhân viên tối đa của gói.'
      }
      reason={disabling ? { label: 'Lý do khóa', required: true, maxLength: 500, placeholder: 'Ví dụ: Nghỉ việc' } : undefined}
      busy={mutation.isPending}
      error={mutation.error ? tenantError(mutation.error).message : null}
      onConfirm={(reason) => mutation.mutate(reason)}
      onCancel={onClose}
    />
  )
}
