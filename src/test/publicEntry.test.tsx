import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from '../App'
import { useAuthStore } from '../features/auth/store/authStore'
import { packageSelection } from '../features/onboarding/utils/packageSelection'
import { queryClient } from '../shared/api/queryClient'
import type { AuthUser, RegisterRestaurantRequest, UserRole } from '../shared/types/auth'
import { postLoginRoute } from '../shared/utils/routing'
import { API, apiError, catalog, onboardingOwner, onboardingStatus, restaurantProfile } from './onboardingFixtures'
import { server } from './server'

const renderApp = (entry: string) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )

const onboardingHandlers = [
  http.get(`${API}/packages`, () => HttpResponse.json(catalog)),
  http.get(`${API}/subscriptions/onboarding`, () => HttpResponse.json(onboardingStatus())),
  http.get(`${API}/restaurants/me`, () => HttpResponse.json(restaurantProfile())),
  http.get(`${API}/subscription-purchases`, () => HttpResponse.json({ content: [], page: 0, size: 10, totalElements: 0, totalPages: 0 })),
]

const staff = (role: UserRole): AuthUser => ({ ...onboardingOwner, id: `${role}-1`, role, permissions: [] })

describe('landing page', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useAuthStore.getState().clearSession()
  })

  it('renders for visitors with live prices and a package link', async () => {
    server.use(...onboardingHandlers)
    renderApp('/')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Quản lý nhà hàng')
    const link = await screen.findByRole('link', { name: 'Chọn gói Pro' })
    expect(link).toHaveAttribute('href', '/register?package=PRO')
    expect(screen.getByText(/399\.000/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login')
  })

  it('stays on the landing page for signed-in users and swaps the CTA', async () => {
    server.use(...onboardingHandlers)
    useAuthStore.setState({ status: 'authenticated', user: onboardingOwner, entitlementState: 'inactive' })
    renderApp('/')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Quản lý nhà hàng')
    expect(screen.getAllByRole('link', { name: 'Vào ứng dụng' })[0]).toHaveAttribute('href', '/app')
    expect(screen.queryByRole('link', { name: 'Đăng nhập' })).not.toBeInTheDocument()
    await screen.findByRole('heading', { name: 'Pro' })
  })

  it('keeps the page usable when the catalog fails, with no hardcoded prices', async () => {
    server.use(http.get(`${API}/packages`, () => apiError(500, 'INTERNAL_ERROR')))
    renderApp('/')
    expect(await screen.findByText('Chưa tải được bảng giá.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByText(/399\.000/)).not.toBeInTheDocument()
    server.use(...onboardingHandlers)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('link', { name: 'Chọn gói Pro' })).toBeInTheDocument()
  })
})

describe('tenant routing', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useAuthStore.getState().clearSession()
  })

  it('sends an owner without a subscription to onboarding', async () => {
    server.use(...onboardingHandlers)
    useAuthStore.setState({ status: 'authenticated', user: onboardingOwner, entitlementState: 'inactive' })
    renderApp('/cashier/dashboard')
    expect(await screen.findByRole('heading', { name: 'Thông tin nhà hàng' })).toBeInTheDocument()
  })

  it('reaches onboarding after login when the owner has no subscription', async () => {
    server.use(...onboardingHandlers, http.get(`${API}/me/entitlements`, () => apiError(403, 'SUBSCRIPTION_NOT_ACTIVE')))
    const user = userEvent.setup()
    window.history.pushState({}, '', '/login')
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>,
    )
    await user.type(await screen.findByLabelText('Email'), 'owner@example.com')
    await user.type(screen.getByLabelText('Mật khẩu'), 'correct')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByRole('heading', { name: 'Thông tin nhà hàng' })).toBeInTheDocument()
  })

  it('keeps managers on the subscription notice', async () => {
    useAuthStore.setState({ status: 'authenticated', user: staff('MANAGER'), entitlementState: 'inactive' })
    renderApp('/cashier/dashboard')
    expect(await screen.findByRole('heading', { name: 'Nhà hàng chưa có gói hoạt động' })).toBeInTheDocument()
  })

  it.each(['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'] as const)('blocks %s from onboarding', async (role) => {
    useAuthStore.setState({ status: 'authenticated', user: staff(role), entitlementState: 'inactive' })
    renderApp('/onboarding')
    expect(await screen.findByRole('heading', { name: 'Bạn không có quyền truy cập' })).toBeInTheDocument()
  })

  it('sends visitors to login from onboarding', async () => {
    renderApp('/onboarding')
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument()
  })

  it('allows only owners to return to onboarding after login', () => {
    expect(postLoginRoute(onboardingOwner, '/onboarding/purchases/1')).toBe('/onboarding/purchases/1')
    expect(postLoginRoute(staff('MANAGER'), '/onboarding')).toBe('/cashier/dashboard')
  })
})

describe('register page', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useAuthStore.getState().clearSession()
  })

  const fillForm = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText('Tên nhà hàng'), 'Quán Đồng Quê')
    await user.type(screen.getByLabelText('Họ tên'), 'Chủ Quán')
    await user.type(screen.getByLabelText('Email'), 'Owner@Example.com')
    await user.type(screen.getByLabelText('Mật khẩu'), 'matkhau123')
  }
  const authResponse = { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900, user: onboardingOwner }
  const notActive = http.get(`${API}/me/entitlements`, () => apiError(403, 'SUBSCRIPTION_NOT_ACTIVE'))

  it('validates required fields without calling the API', async () => {
    const user = userEvent.setup()
    renderApp('/register')
    await user.click(await screen.findByRole('button', { name: 'Tạo tài khoản' }))
    expect(await screen.findByText('Tên nhà hàng là bắt buộc.')).toBeInTheDocument()
    expect(screen.getByText('Mật khẩu cần ít nhất 8 ký tự.')).toBeInTheDocument()
  })

  it('sends the DTO, then lands on onboarding with the chosen package kept', async () => {
    let body: RegisterRestaurantRequest | undefined
    server.use(
      ...onboardingHandlers,
      notActive,
      http.post(`${API}/auth/register-restaurant`, async ({ request }) => {
        body = (await request.json()) as RegisterRestaurantRequest
        return HttpResponse.json(authResponse, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderApp('/register?package=PRO')
    await screen.findByRole('button', { name: 'Tạo tài khoản' })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))
    expect(await screen.findByRole('heading', { name: 'Thông tin nhà hàng' })).toBeInTheDocument()
    expect(body).toMatchObject({
      restaurantName: 'Quán Đồng Quê',
      timezone: 'Asia/Ho_Chi_Minh',
      currencyCode: 'VND',
      ownerName: 'Chủ Quán',
      ownerEmail: 'owner@example.com',
      password: 'matkhau123',
    })
    expect(body?.restaurantCode).toMatch(/^QUAN_DONG_QUE_/)
    expect(body).not.toHaveProperty('ownerPhone')
    expect(packageSelection.read()).toBe('PRO')
  })

  it('retries once with a new code on RESTAURANT_CODE_EXISTS', async () => {
    const codes: string[] = []
    server.use(
      ...onboardingHandlers,
      notActive,
      http.post(`${API}/auth/register-restaurant`, async ({ request }) => {
        codes.push(((await request.json()) as RegisterRestaurantRequest).restaurantCode)
        return codes.length === 1 ? apiError(409, 'RESTAURANT_CODE_EXISTS') : HttpResponse.json(authResponse, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderApp('/register')
    await screen.findByRole('button', { name: 'Tạo tài khoản' })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))
    await waitFor(() => expect(codes).toHaveLength(2))
    expect(codes[0]).not.toBe(codes[1])
  })

  it('attaches EMAIL_EXISTS to the email field', async () => {
    server.use(http.post(`${API}/auth/register-restaurant`, () => apiError(409, 'EMAIL_EXISTS')))
    const user = userEvent.setup()
    renderApp('/register')
    await screen.findByRole('button', { name: 'Tạo tài khoản' })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))
    expect(await screen.findByText(/Email này đã được đăng ký/)).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('warns that a network failure may have created the account, without resending', async () => {
    let calls = 0
    server.use(
      http.post(`${API}/auth/register-restaurant`, () => {
        calls += 1
        return HttpResponse.error()
      }),
    )
    const user = userEvent.setup()
    renderApp('/register')
    await screen.findByRole('button', { name: 'Tạo tài khoản' })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tài khoản có thể đã được tạo')
    expect(calls).toBe(1)
  })
})
