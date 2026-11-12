import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { restaurantUsersApi } from '../api/restaurantUsersApi'
import type { AdminRestaurantUser } from '../../../shared/types/admin'
import { ReasonDialog } from './PaymentUi'

/** Lock/unlock an account and issue a one-time temporary password; the password is shown once and never cached. */
export function RestaurantUserSupportActions({ restaurantId, user }: { restaurantId: string; user: AdminRestaurantUser }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<'status' | 'password' | null>(null)
  const [password, setPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'restaurants', restaurantId, 'users'] })

  return (
    <div className="user-support">
      <div className="subscription-actions">
        <button
          className={`button button-small ${user.active ? 'button-danger' : 'button-primary'}`}
          type="button"
          onClick={() => setOpen('status')}
        >
          {user.active ? 'Khoá tài khoản' : 'Mở khoá tài khoản'}
        </button>
        <button className="button button-small button-ghost" type="button" onClick={() => setOpen('password')}>
          Cấp mật khẩu tạm
        </button>
      </div>
      {password && (
        <div className="info-banner temp-password" role="status">
          <span>Mật khẩu tạm (chỉ hiển thị một lần, hãy gửi cho người dùng qua kênh an toàn):</span>
          <div className="copy-row">
            <code>{password}</code>
            <button
              className="button button-small button-ghost"
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(password).then(() => setCopied(true))
              }}
            >
              {copied ? 'Đã sao chép' : 'Sao chép'}
            </button>
          </div>
          <span className="form-hint">Mọi phiên đăng nhập cũ của tài khoản đã bị đăng xuất.</span>
        </div>
      )}
      {open === 'status' && (
        <ReasonDialog
          title={user.active ? 'Khoá tài khoản' : 'Mở khoá tài khoản'}
          danger={user.active}
          description={
            user.active
              ? `${user.name} sẽ bị đăng xuất khỏi mọi thiết bị và không thể đăng nhập cho đến khi được mở khoá.`
              : `${user.name} sẽ có thể đăng nhập lại.`
          }
          fields={[{ name: 'reason', label: 'Lý do', minLength: 5, maxLength: 500, multiline: true }]}
          submitLabel={user.active ? 'Khoá' : 'Mở khoá'}
          onClose={() => setOpen(null)}
          onSubmit={async (values) => {
            await restaurantUsersApi.updateStatus(restaurantId, user.id, { active: !user.active, reason: values.reason })
            setOpen(null)
            await refresh()
          }}
        />
      )}
      {open === 'password' && (
        <ReasonDialog
          title="Cấp mật khẩu tạm"
          description={`Mật khẩu hiện tại của ${user.name} sẽ bị thay bằng mật khẩu ngẫu nhiên và mọi phiên đăng nhập bị huỷ.`}
          fields={[{ name: 'reason', label: 'Lý do (VD: chủ quán quên mật khẩu, đã xác minh qua điện thoại)', minLength: 5, maxLength: 500, multiline: true }]}
          submitLabel="Cấp mật khẩu"
          onClose={() => setOpen(null)}
          onSubmit={async (values) => {
            const result = await restaurantUsersApi.issueTemporaryPassword(restaurantId, user.id, values.reason)
            setCopied(false)
            setPassword(result.temporaryPassword)
            setOpen(null)
          }}
        />
      )}
    </div>
  )
}
