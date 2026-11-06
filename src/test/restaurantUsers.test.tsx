import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { adminRestaurantDetail, adminUser, server } from './server'
import { useAuthStore } from '../features/auth/store/authStore'
import { RestaurantDetailPage } from '../features/admin/pages/RestaurantDetailPage'
import type { AdminRestaurantUser } from '../shared/types/admin'

const base = 'http://localhost:8080/api/v1/admin/restaurants'
const account: AdminRestaurantUser = {
  id: 'staff-1',
  name: 'Nguyễn Văn A',
  email: 'staff@example.com',
  phone: null,
  active: true,
  role: { id: 'role-1', code: 'WAITER', name: 'Phục vụ', active: true },
  lastLoginAt: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-20T00:00:00Z',
}
const page = { content: [account], page: 0, size: 20, totalElements: 21, totalPages: 2 }
function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/restaurants/restaurant-1']}>
        <Link to="/admin/restaurants/restaurant-2">Nhà hàng khác</Link>
        <Routes>
          <Route path="/admin/restaurants/:restaurantId" element={<RestaurantDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
async function openUsers() {
  await userEvent.click(await screen.findByRole('button', { name: 'Tài khoản' }))
}

describe('restaurant detail and accounts', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession()
    useAuthStore.setState({ status: 'authenticated', user: adminUser })
    server.use(
      http.get(`${base}/:restaurantId/users`, () => HttpResponse.json(page)),
      http.get(`${base}/:restaurantId/users/:userId`, () =>
        HttpResponse.json({
          ...account,
          passwordHash: 'secret-hash',
          refreshToken: 'secret-token',
          deletedAt: 'secret-date',
        }),
      ),
    )
  })

  it('renders backend detail, owners, nested userCounts and subscription', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: adminRestaurantDetail.name, level: 2 })).toBeInTheDocument()
    expect(screen.getByText('123 Nguyễn Huệ')).toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(screen.getByText('Tổng user').parentElement).toHaveTextContent('4')
    expect(screen.getByText('User active').parentElement).toHaveTextContent('3')
    expect(screen.getByText('Subscription hiệu lực')).toBeInTheDocument()
  })

  it('queries the path restaurant and opens a read-only detail without secrets', async () => {
    let detailPath = ''
    server.use(
      http.get(`${base}/:restaurantId/users/:userId`, ({ params }) => {
        detailPath = `${params.restaurantId}/${params.userId}`
        return HttpResponse.json({
          ...account,
          passwordHash: 'secret-hash',
          refreshToken: 'secret-token',
          deletedAt: 'secret-date',
        })
      }),
    )
    setup()
    await openUsers()
    await userEvent.click(await screen.findByRole('button', { name: account.name }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(account.email)).toBeInTheDocument()
    expect(detailPath).toBe('restaurant-1/staff-1')
    expect(dialog).toHaveTextContent('Phục vụ (WAITER)')
    expect(dialog).not.toHaveTextContent(/secret-|passwordHash|refreshToken|deletedAt/)
    expect(within(dialog).queryByRole('button', { name: /Sửa|Lưu|Mật khẩu|Vô hiệu/ })).not.toBeInTheDocument()
  })

  it('sends debounced normalized search, role, active, sort and server pagination', async () => {
    const requests: URL[] = []
    server.use(
      http.get(`${base}/:restaurantId/users`, ({ request, params }) => {
        expect(params.restaurantId).toBe('restaurant-1')
        const url = new URL(request.url)
        requests.push(url)
        return HttpResponse.json({ ...page, page: Number(url.searchParams.get('page')) })
      }),
    )
    setup()
    await openUsers()
    await screen.findByText(account.email)
    fireEvent.change(screen.getByLabelText('Tìm tài khoản'), { target: { value: '  Nguyen  ' } })
    fireEvent.change(screen.getByLabelText('Lọc role'), { target: { value: ' waiter ' } })
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('roleCode')).toBe('WAITER'))
    expect(requests.at(-1)?.searchParams.get('q')).toBe('Nguyen')
    await userEvent.selectOptions(screen.getByLabelText('Trạng thái tài khoản'), 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Email' }))
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('sortBy')).toBe('email'))
    expect(requests.at(-1)?.searchParams.get('direction')).toBe('asc')
    expect(requests.at(-1)?.searchParams.get('active')).toBe('false')
    await userEvent.click(screen.getByRole('button', { name: 'Sau →' }))
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('page')).toBe('1'))
    expect(await screen.findByText('Trang 2 / 2')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Số tài khoản mỗi trang'), '50')
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('size')).toBe('50'))
    expect(requests.at(-1)?.searchParams.get('page')).toBe('0')
  })

  it('renders empty state', async () => {
    server.use(
      http.get(`${base}/:restaurantId/users`, () =>
        HttpResponse.json({ ...page, content: [], totalElements: 0, totalPages: 0 }),
      ),
    )
    setup()
    await openUsers()
    expect(await screen.findByText('Không có tài khoản')).toBeInTheDocument()
  })

  it.each([
    [404, 'RESTAURANT_NOT_FOUND', 'Không tìm thấy dữ liệu'],
    [403, 'FORBIDDEN', 'Bạn không có quyền truy cập'],
  ])('shows restaurant HTTP %s', async (status, code, text) => {
    server.use(http.get(`${base}/:restaurantId`, () => HttpResponse.json({ code }, { status: Number(status) })))
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })

  it('shows user-list errors and allows retry', async () => {
    let failed = true
    server.use(
      http.get(`${base}/:restaurantId/users`, () =>
        failed ? HttpResponse.json({ code: 'FORBIDDEN' }, { status: 403 }) : HttpResponse.json(page),
      ),
    )
    setup()
    await openUsers()
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn không có quyền truy cập')
    failed = false
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText(account.email)).toBeInTheDocument()
  })

  it('removes selected user and cached list immediately on restaurant navigation', async () => {
    server.use(
      http.get(`${base}/:restaurantId/users`, ({ params }) =>
        HttpResponse.json(params.restaurantId === 'restaurant-1' ? page : { ...page, content: [] }),
      ),
    )
    setup()
    await openUsers()
    await userEvent.click(await screen.findByRole('button', { name: account.name }))
    expect(await within(await screen.findByRole('dialog')).findByText(account.email)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Nhà hàng khác' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await openUsers()
    expect(await screen.findByText('Không có tài khoản')).toBeInTheDocument()
    expect(screen.queryByText(account.email)).not.toBeInTheDocument()
  })

  it.each([
    { ...adminUser, permissions: [] },
    { ...adminUser, restaurantId: 'tenant-1' },
    { ...adminUser, role: 'OWNER' as const, restaurantId: 'tenant-1' },
  ])('blocks unauthorized identity without fetching restaurant', async (user) => {
    let calls = 0
    server.use(
      http.get(`${base}/:restaurantId`, () => {
        calls++
        return HttpResponse.json(adminRestaurantDetail)
      }),
    )
    useAuthStore.setState({ user })
    setup()
    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tài khoản' })).not.toBeInTheDocument()
    expect(calls).toBe(0)
  })
})
