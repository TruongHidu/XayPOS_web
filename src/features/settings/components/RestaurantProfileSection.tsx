import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { Drawer } from '../../../shared/ui/Drawer'
import { Panel } from '../../../shared/ui/Display'
import { TextField, TextAreaField } from '../../../shared/ui/FormFields'
import { MutationError } from '../../../shared/ui/MutationError'
import { ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { useAuthStore } from '../../auth/store/authStore'
import { settingsApi, settingsKeys } from '../api/settingsApi'
import { profileFormSchema, type ProfileForm, type RestaurantProfile } from '../schemas'

export function RestaurantProfileSection({ canEdit }: { canEdit: boolean }) {
  const { scope } = useTenantAccess()
  const [editing, setEditing] = useState(false)
  const query = useQuery({
    queryKey: settingsKeys.profile(scope),
    queryFn: ({ signal }) => settingsApi.profile(scope!, signal),
    enabled: !!scope,
    retry: false,
  })
  const profile = query.data
  return (
    <Panel
      title="Nhà hàng"
      actions={
        canEdit && profile ? (
          <button type="button" className="button button-small button-ghost" onClick={() => setEditing(true)}>
            Sửa thông tin
          </button>
        ) : null
      }
    >
      {query.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : query.error && !profile ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : profile ? (
        <dl className="ui-facts">
          <dt>Tên nhà hàng</dt>
          <dd>{profile.name}</dd>
          <dt>Mã nhà hàng</dt>
          <dd>{profile.code}</dd>
          <dt>Tên pháp lý</dt>
          <dd>{profile.legalName || '—'}</dd>
          <dt>Điện thoại</dt>
          <dd>{profile.phone || '—'}</dd>
          <dt>Địa chỉ</dt>
          <dd>{profile.address || '—'}</dd>
          <dt>Múi giờ · Tiền tệ</dt>
          <dd>
            {profile.timezone} · {profile.currencyCode}
          </dd>
        </dl>
      ) : null}
      {editing && profile && <ProfileDrawer profile={profile} onClose={() => setEditing(false)} onReload={() => void query.refetch()} />}
    </Panel>
  )
}

function ProfileDrawer({ profile, onClose, onReload }: { profile: RestaurantProfile; onClose: () => void; onReload: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: profile.name,
      legalName: profile.legalName ?? '',
      phone: profile.phone ?? '',
      address: profile.address ?? '',
    },
  })
  const save = useTenantMutation({
    mutationFn: settingsApi.updateProfile,
    invalidate: (scope) => [settingsKeys.profile(scope)],
    success: 'Đã lưu thông tin nhà hàng.',
    onSuccess: (updated) => {
      // The sidebar shows the restaurant name from the signed-in user.
      useAuthStore.setState((state) => (state.user ? { user: { ...state.user, restaurantName: updated.name } } : state))
      onClose()
    },
  })
  return (
    <Drawer
      title="Sửa thông tin nhà hàng"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" form="restaurant-profile-form" className="button button-primary" disabled={save.isPending || !isDirty}>
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </button>
        </>
      }
    >
      <form id="restaurant-profile-form" onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
        <TextField label="Tên nhà hàng" required error={errors.name?.message} {...register('name')} />
        <TextField label="Tên pháp lý" hint="Tên công ty / hộ kinh doanh in trên hóa đơn (nếu có)." error={errors.legalName?.message} {...register('legalName')} />
        <TextField label="Điện thoại" inputMode="tel" error={errors.phone?.message} {...register('phone')} />
        <TextAreaField label="Địa chỉ" error={errors.address?.message} {...register('address')} />
        <p className="form-hint">Để trống một ô để xóa thông tin đó. Múi giờ và tiền tệ được cố định theo nhà hàng.</p>
        <MutationError error={save.error} onReload={onReload} />
      </form>
    </Drawer>
  )
}
