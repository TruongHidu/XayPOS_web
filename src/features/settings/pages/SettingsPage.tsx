import { useNavigate } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { PageTitle, Panel, StatusBadge } from '../../../shared/ui/Display'
import { useAuthStore } from '../../auth/store/authStore'
import { roleLabel } from '../../../shared/utils/roleLabels'
import { MenuLinkSection } from '../components/MenuLinkSection'
import { RestaurantProfileSection } from '../components/RestaurantProfileSection'
import { TransferAccountSection } from '../components/TransferAccountSection'
import {
  canManageMenuLink,
  canManageTransferAccount,
  canUpdateRestaurantProfile,
  canViewPackage,
  canViewRestaurantProfile,
  canViewTransferAccount,
} from '../policies/settingsAccessPolicy'
import { packageFeatureLabel } from '../utils/settingsLabels'
import '../settings.css'

const formatDay = (iso: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(iso))

export function SettingsPage() {
  const { access } = useTenantAccess()
  const user = useAuthStore((state) => state.user)
  const entitlement = useAuthStore((state) => state.entitlement)
  const signOut = useAuthStore((state) => state.signOut)
  const navigate = useNavigate()
  return (
    <div className="ui-page settings-page">
      <PageTitle title="Cài đặt" description="Thông tin nhà hàng, QR menu, nhận chuyển khoản và gói dịch vụ." />
      {canViewRestaurantProfile(access) && <RestaurantProfileSection canEdit={canUpdateRestaurantProfile(access)} />}
      {canManageMenuLink(access) && <MenuLinkSection />}
      {canViewTransferAccount(access) && <TransferAccountSection canEdit={canManageTransferAccount(access)} />}
      {canViewPackage(access) && entitlement && (
        <Panel title="Gói dịch vụ">
          <dl className="ui-facts">
            <dt>Gói</dt>
            <dd>
              {entitlement.packageName ?? entitlement.packageCode}{' '}
              <StatusBadge tone={entitlement.status === 'ACTIVE' ? 'success' : 'warning'}>
                {entitlement.status === 'ACTIVE' ? 'Đang hoạt động' : entitlement.status}
              </StatusBadge>
            </dd>
            <dt>Hiệu lực</dt>
            <dd>
              {formatDay(entitlement.startAt)} → {formatDay(entitlement.endAt)}
            </dd>
            <dt>Số nhân viên tối đa</dt>
            <dd>{entitlement.maxStaff ?? 'Không giới hạn'}</dd>
          </dl>
          <div className="settings-features" aria-label="Chức năng trong gói">
            {entitlement.features.map((feature) => (
              <span key={feature.code} className="ui-badge ui-badge-primary">
                {packageFeatureLabel(feature.code)}
              </span>
            ))}
          </div>
        </Panel>
      )}
      <Panel title="Tài khoản của tôi">
        <dl className="ui-facts">
          <dt>Họ tên</dt>
          <dd>{user?.name}</dd>
          <dt>Email</dt>
          <dd>{user?.email}</dd>
          <dt>Vai trò</dt>
          <dd>{roleLabel(user?.role)}</dd>
        </dl>
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            className="button button-ghost"
            onClick={async () => {
              await signOut()
              navigate('/login', { replace: true })
            }}
          >
            Đăng xuất
          </button>
        </div>
      </Panel>
    </div>
  )
}
