import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { SettingsPage } from '../features/settings/pages/SettingsPage'
import { settingsApi } from '../features/settings/api/settingsApi'
import { normalizeAccountName, transferAccountFormSchema } from '../features/settings/schemas'
import { StaffPage } from '../features/staff/pages/StaffPage'
import { canAssignStaffRole, canManageStaff, canStaff } from '../features/staff/policies/staffAccessPolicy'
import { useAuthStore } from '../features/auth/store/authStore'
import { base, failure, page } from './orderFixtures'
import { dates, mids, renderPage, resetTenant, seedTenant, staffFixture } from './managementFixtures'
import { server } from './server'

const profile = {
  id: mids.restaurant,
  code: 'DEMO',
  name: 'Quán Demo',
  legalName: null,
  phone: null,
  address: null,
  timezone: 'Asia/Ho_Chi_Minh',
  currencyCode: 'VND',
  status: 'ACTIVE',
  ...dates,
}

const accessOf = () => {
  const state = useAuthStore.getState()
  return { user: state.user, entitlement: state.entitlement, entitlementState: state.entitlementState }
}

beforeAll(() => {
  // jsdom has no object URLs; QR previews only need a stable string.
  URL.createObjectURL ??= vi.fn(() => 'blob:test')
  URL.revokeObjectURL ??= vi.fn()
})

afterEach(() => {
  cleanup()
  resetTenant()
})

describe('settings', () => {
  it('treats an uninitialised menu link as absent and normalises transfer account input', async () => {
    const scope = seedTenant({ permissions: ['RESTAURANT_PROFILE_UPDATE'], features: [] })
    server.use(http.get(base + '/restaurants/me/menu-link', () => failure('PUBLIC_MENU_LINK_NOT_INITIALIZED', 404)))
    await expect(settingsApi.menuLink(scope)).resolves.toBeNull()
    expect(normalizeAccountName('  Nguyễn   Văn Đức ')).toBe('NGUYEN VAN DUC')
    expect(transferAccountFormSchema.parse({ bankBin: '970436', accountNumber: '0123 456 789', accountName: 'Trần Thị Bé' })).toEqual({
      bankBin: '970436',
      accountNumber: '0123456789',
      accountName: 'TRAN THI BE',
    })
  })

  it('shows only the sections the user may see and saves the profile', async () => {
    seedTenant({ permissions: ['RESTAURANT_PROFILE_VIEW', 'RESTAURANT_PROFILE_UPDATE'], features: [] })
    let body: unknown
    server.use(
      http.get(base + '/restaurants/me', () => HttpResponse.json(profile)),
      http.patch(base + '/restaurants/me', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...profile, name: 'Quán Mới', phone: '0900000000' })
      }),
      http.get(base + '/restaurants/me/menu-link', () =>
        HttpResponse.json({ menuToken: 'tok', menuPath: '/menu/tok', menuUrl: 'http://localhost:3000/menu/tok' }),
      ),
      http.get(base + '/restaurants/me/menu-link/qr/image', () => new HttpResponse(new Uint8Array([137, 80, 78, 71]).buffer, { headers: { 'Content-Type': 'image/png' } })),
      http.get(base + '/restaurants/me/transfer-account', () => HttpResponse.json({ configured: false })),
    )
    const user = userEvent.setup()
    renderPage(<SettingsPage />, { path: '/app/settings' })
    expect(await screen.findByText('Quán Demo')).toBeInTheDocument()
    expect(await screen.findByText('http://localhost:3000/menu/tok')).toBeInTheDocument()
    expect(await screen.findByText(/Chưa có tài khoản nhận chuyển khoản/)).toBeInTheDocument()
    // No SUBSCRIPTION_VIEW: the package section stays hidden.
    expect(screen.queryByText('Gói dịch vụ')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sửa thông tin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sửa thông tin nhà hàng' })
    const name = within(dialog).getByLabelText(/Tên nhà hàng/)
    await user.clear(name)
    await user.type(name, 'Quán Mới')
    await user.type(within(dialog).getByLabelText('Điện thoại'), '0900000000')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(body).toEqual({ name: 'Quán Mới', legalName: '', phone: '0900000000', address: '' }))
    await waitFor(() => expect(useAuthStore.getState().user?.restaurantName).toBe('Quán Mới'))
  })
})

describe('staff policy', () => {
  it('follows the owner / manager hierarchy of the app', () => {
    seedTenant({ role: 'MANAGER', permissions: ['STAFF_VIEW', 'STAFF_UPDATE', 'STAFF_PERMISSION_MANAGE'], features: ['STAFF_MANAGEMENT'] })
    const manager = accessOf()
    expect(canStaff(manager, 'STAFF_VIEW')).toBe(true)
    expect(canStaff(manager, 'STAFF_PERMISSION_MANAGE')).toBe(false) // needs STAFF_PERMISSION feature
    expect(canAssignStaffRole(manager, 'WAITER')).toBe(true)
    expect(canAssignStaffRole(manager, 'MANAGER')).toBe(false)
    expect(canManageStaff(manager, 'STAFF_UPDATE', manager.user!.id, 'WAITER')).toBe(false) // never yourself
    seedTenant({ role: 'CASHIER', permissions: ['STAFF_VIEW'], features: ['STAFF_MANAGEMENT'] })
    expect(canStaff(accessOf(), 'STAFF_VIEW')).toBe(false)
  })
})

describe('staff page', () => {
  const ownerPermissions = ['STAFF_VIEW', 'STAFF_CREATE', 'STAFF_UPDATE', 'STAFF_DISABLE', 'STAFF_PERMISSION_MANAGE', 'ORDER_VIEW', 'ORDER_CANCEL']
  const features = ['STAFF_MANAGEMENT', 'STAFF_PERMISSION']

  it('creates a staff account with an assignable role', async () => {
    seedTenant({ permissions: ownerPermissions, features, maxStaff: 3 })
    let body: unknown
    server.use(
      http.get(base + '/staff', () => HttpResponse.json(page([staffFixture()]))),
      http.get(base + '/staff/roles', () =>
        HttpResponse.json([
          { id: mids.role, code: 'WAITER', name: 'Waiter' },
          { id: mids.recipe, code: 'MANAGER', name: 'Manager' },
        ]),
      ),
      http.post(base + '/staff', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(staffFixture({ name: 'Minh' }), { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderPage(<StaffPage />, { path: '/app/staff' })
    expect(await screen.findByText('Lan')).toBeInTheDocument()
    expect(screen.getByText(/tối đa 3 nhân viên/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Thêm nhân viên/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Thêm nhân viên' })
    await user.type(within(dialog).getByLabelText(/Họ tên/), 'Minh')
    await user.type(within(dialog).getByLabelText(/Email/), 'MINH@Example.com')
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Quản lý' })).toBeInTheDocument())
    await user.selectOptions(within(dialog).getByLabelText(/Vai trò/), 'WAITER')
    await user.type(within(dialog).getByLabelText(/Mật khẩu ban đầu/), 'Secret123!')
    await user.click(within(dialog).getByRole('button', { name: 'Thêm nhân viên' }))
    await waitFor(() =>
      expect(body).toEqual({ name: 'Minh', email: 'minh@example.com', roleCode: 'WAITER', initialPassword: 'Secret123!' }),
    )
  })

  it('requires a reason to disable and saves permission overrides', async () => {
    seedTenant({ permissions: ownerPermissions, features })
    let status: unknown
    let overrides: unknown
    server.use(
      http.get(base + '/staff', () => HttpResponse.json(page([staffFixture()]))),
      http.patch(base + '/staff/:id/status', async ({ request }) => {
        status = await request.json()
        return HttpResponse.json(staffFixture({ active: false }))
      }),
      http.get(base + '/staff/permissions', () =>
        HttpResponse.json([
          { code: 'ORDER_VIEW', module: 'ORDER', name: 'View', description: null },
          { code: 'ORDER_CANCEL', module: 'ORDER', name: 'Cancel', description: null },
          { code: 'ORDER_COMPLETE', module: 'ORDER', name: 'Complete', description: null },
        ]),
      ),
      http.get(base + '/staff/:id/permissions', () =>
        HttpResponse.json({ staffId: mids.staff, roleCode: 'WAITER', rolePermissions: ['ORDER_VIEW'], grants: [], denies: [], effectivePermissions: ['ORDER_VIEW'] }),
      ),
      http.put(base + '/staff/:id/permissions', async ({ request }) => {
        overrides = await request.json()
        return HttpResponse.json({ staffId: mids.staff, roleCode: 'WAITER', rolePermissions: ['ORDER_VIEW'], grants: ['ORDER_CANCEL'], denies: ['ORDER_VIEW'], effectivePermissions: ['ORDER_CANCEL'] })
      }),
    )
    const user = userEvent.setup()
    renderPage(<StaffPage />, { path: '/app/staff' })
    await user.click(await screen.findByRole('button', { name: 'Khóa' }))
    const confirm = await screen.findByRole('dialog', { name: /Khóa tài khoản Lan/ })
    expect(within(confirm).getByRole('button', { name: 'Khóa tài khoản' })).toBeDisabled()
    await user.type(within(confirm).getByLabelText(/Lý do khóa/), 'Nghỉ việc')
    await user.click(within(confirm).getByRole('button', { name: 'Khóa tài khoản' }))
    await waitFor(() => expect(status).toEqual({ active: false, reason: 'Nghỉ việc' }))

    await user.click(screen.getByRole('button', { name: 'Phân quyền' }))
    const drawer = await screen.findByRole('dialog', { name: 'Phân quyền: Lan' })
    const cancel = await within(drawer).findByRole('radiogroup', { name: 'Hủy đơn hàng' })
    await user.click(within(cancel).getByRole('radio', { name: 'Cho phép' }))
    // The owner lacks ORDER_COMPLETE, so it cannot be granted.
    expect(within(within(drawer).getByRole('radiogroup', { name: 'Hoàn tất đơn hàng' })).getByRole('radio', { name: 'Cho phép' })).toBeDisabled()
    await user.click(within(within(drawer).getByRole('radiogroup', { name: 'Xem đơn hàng' })).getByRole('radio', { name: 'Chặn' }))
    await user.click(within(drawer).getByRole('button', { name: 'Lưu phân quyền' }))
    await waitFor(() => expect(overrides).toEqual({ grants: ['ORDER_CANCEL'], denies: ['ORDER_VIEW'] }))
  })
})
