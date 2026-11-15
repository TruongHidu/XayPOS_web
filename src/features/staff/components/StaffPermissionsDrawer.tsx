import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { Drawer } from '../../../shared/ui/Drawer'
import { Notice } from '../../../shared/ui/Display'
import { MutationError } from '../../../shared/ui/MutationError'
import { ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { staffApi, staffKeys } from '../api/staffApi'
import type { PermissionCatalogItem, StaffMember, StaffPermissions } from '../schemas'
import { groupPermissions, permissionName } from '../utils/staffLabels'

type Effect = 'default' | 'grant' | 'deny'

/**
 * Per-staff permission overrides on top of the role defaults:
 * effective = (role ∪ grants) − denies. Saving replaces all overrides.
 */
export function StaffPermissionsDrawer({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const { scope } = useTenantAccess()
  const catalog = useQuery({
    queryKey: staffKeys.catalog(scope),
    queryFn: ({ signal }) => staffApi.catalog(scope!, signal),
    enabled: !!scope,
    staleTime: 5 * 60_000,
  })
  const current = useQuery({
    queryKey: staffKeys.permissions(scope, member.id),
    queryFn: ({ signal }) => staffApi.permissions(scope!, member.id, signal),
    enabled: !!scope,
  })
  const loading = catalog.isLoading || current.isLoading
  const error = catalog.error ?? current.error
  return (
    <Drawer title={`Phân quyền: ${member.name}`} subtitle="Điều chỉnh riêng so với quyền mặc định của vai trò." onClose={onClose} width="lg">
      {loading ? (
        <LoadingSkeleton rows={8} />
      ) : error || !catalog.data || !current.data ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void catalog.refetch()
            void current.refetch()
          }}
        />
      ) : (
        <PermissionEditor
          key={current.dataUpdatedAt}
          member={member}
          catalog={catalog.data}
          current={current.data}
          onClose={onClose}
          onReload={() => void current.refetch()}
        />
      )}
    </Drawer>
  )
}

function PermissionEditor({
  member,
  catalog,
  current,
  onClose,
  onReload,
}: {
  member: StaffMember
  catalog: PermissionCatalogItem[]
  current: StaffPermissions
  onClose: () => void
  onReload: () => void
}) {
  const { access } = useTenantAccess()
  const mine = new Set(access.user?.permissions ?? [])
  const [grants, setGrants] = useState(() => new Set(current.grants))
  const [denies, setDenies] = useState(() => new Set(current.denies))
  const rolePermissions = useMemo(() => new Set(current.rolePermissions), [current.rolePermissions])
  const groups = useMemo(() => groupPermissions(catalog), [catalog])
  const save = useTenantMutation({
    mutationFn: (s, body: { grants: string[]; denies: string[] }) => staffApi.savePermissions(s, member.id, body.grants, body.denies),
    invalidate: (s) => [staffKeys.permissions(s, member.id)],
    success: 'Đã lưu phân quyền. Nhân viên cần đăng nhập lại để nhận quyền mới.',
    onSuccess: onClose,
  })

  const effectOf = (code: string): Effect => (grants.has(code) ? 'grant' : denies.has(code) ? 'deny' : 'default')
  const setEffect = (code: string, effect: Effect) => {
    const nextGrants = new Set(grants)
    const nextDenies = new Set(denies)
    nextGrants.delete(code)
    nextDenies.delete(code)
    if (effect === 'grant') nextGrants.add(code)
    if (effect === 'deny') nextDenies.add(code)
    setGrants(nextGrants)
    setDenies(nextDenies)
  }
  const effective = (code: string) => (rolePermissions.has(code) || grants.has(code)) && !denies.has(code)
  const changed =
    [...grants].sort().join() !== [...current.grants].sort().join() || [...denies].sort().join() !== [...current.denies].sort().join()

  return (
    <div className="staff-permissions">
      <Notice tone="info">
        <b>Theo vai trò</b> giữ quyền mặc định; <b>Cho phép</b> cấp thêm; <b>Chặn</b> bỏ quyền dù vai trò có. Bạn chỉ có thể cấp
        những quyền mà chính bạn đang có.
      </Notice>
      {groups.map((group) => (
        <fieldset key={group.label} className="staff-permission-group">
          <legend>{group.label}</legend>
          {group.items.map((item) => {
            const effect = effectOf(item.code)
            const name = permissionName(item)
            return (
              <div key={item.code} className="staff-permission-row">
                <div>
                  <div className="staff-permission-name">
                    {name}
                    {effective(item.code) ? (
                      <span className="ui-badge ui-badge-success">Có quyền</span>
                    ) : (
                      <span className="ui-badge ui-badge-neutral">Không có</span>
                    )}
                  </div>
                  <span className="ui-muted-cell">
                    {item.code} · Vai trò {rolePermissions.has(item.code) ? 'có sẵn' : 'không có'}
                  </span>
                </div>
                <div className="staff-segment" role="radiogroup" aria-label={name}>
                  {(['default', 'grant', 'deny'] as const).map((option) => {
                    const disabled = option === 'grant' && !mine.has(item.code) && effect !== 'grant'
                    return (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={effect === option}
                        disabled={disabled}
                        title={disabled ? 'Bạn không có quyền này nên không thể cấp' : undefined}
                        className={effect === option ? `staff-segment-on staff-segment-${option}` : undefined}
                        onClick={() => setEffect(item.code, option)}
                      >
                        {option === 'default' ? 'Theo vai trò' : option === 'grant' ? 'Cho phép' : 'Chặn'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </fieldset>
      ))}
      <MutationError error={save.error} onReload={onReload} />
      <div className="ui-drawer-inline-footer">
        <button
          type="button"
          className="button button-ghost"
          disabled={grants.size + denies.size === 0}
          onClick={() => {
            setGrants(new Set())
            setDenies(new Set())
          }}
        >
          Khôi phục mặc định vai trò
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="button button-ghost" onClick={onClose}>
          Hủy
        </button>
        <button
          type="button"
          className="button button-primary"
          disabled={!changed || save.isPending}
          onClick={() => save.mutate({ grants: [...grants].sort(), denies: [...denies].sort() })}
        >
          {save.isPending ? 'Đang lưu…' : 'Lưu phân quyền'}
        </button>
      </div>
    </div>
  )
}
