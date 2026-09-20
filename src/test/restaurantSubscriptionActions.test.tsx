import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse, delay } from 'msw'
import { server, adminRestaurant, adminSubscription, adminUser } from './server'
import { useAuthStore } from '../features/auth/store/authStore'
import { setAccessToken } from '../shared/api/httpClient'
import { RestaurantsPage } from '../features/admin/pages/RestaurantsPage'
import type { RestaurantResponse, SubscriptionResponse } from '../shared/types/admin'

const apiBase = 'http://localhost:8080/api/v1'
const availableRestaurant: RestaurantResponse = {
  ...adminRestaurant,
  effectiveSubscription: null,
  packageAssignmentState: 'AVAILABLE',
}
const pendingRestaurant: RestaurantResponse = {
  ...adminRestaurant,
  effectiveSubscription: null,
  packageAssignmentState: 'PENDING',
}
const pendingSubscription: SubscriptionResponse = {
  ...adminSubscription,
  status: 'PENDING',
  activatedAt: null,
  features: [],
}

function page<T>(content: T[]) {
  return { content, page: 0, size: 20, totalElements: content.length, totalPages: content.length ? 1 : 0 }
}

function renderRestaurants() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/restaurants']}>
        <RestaurantsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('restaurant package assignment actions', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession()
    useAuthStore.setState({ status: 'authenticated', user: adminUser })
    setAccessToken('admin-token')
  })

  it('renders AVAILABLE, PENDING, ACTIVE-effective and ACTIVE-future action matrices', async () => {
    server.use(
      http.get(`${apiBase}/admin/restaurants`, () =>
        HttpResponse.json(
          page([
            availableRestaurant,
            { ...pendingRestaurant, id: 'restaurant-2', code: 'DEMO02', name: 'Pending Restaurant' },
            { ...adminRestaurant, id: 'restaurant-3', code: 'DEMO03', name: 'Active Restaurant' },
            {
              ...adminRestaurant,
              id: 'restaurant-4',
              code: 'DEMO04',
              name: 'Future Restaurant',
              effectiveSubscription: null,
              packageAssignmentState: 'ACTIVE',
            },
          ]),
        ),
      ),
    )
    renderRestaurants()
    const rows = await screen.findAllByRole('row')
    expect(rows[1]).toHaveTextContent('Gán gói')
    expect(rows[2]).toHaveTextContent('Kích hoạt')
    expect(rows[2]).toHaveTextContent('Hủy gói chờ')
    expect(rows[2]).not.toHaveTextContent('Gán gói')
    expect(rows[3]).toHaveTextContent('Đổi gói')
    expect(rows[3]).toHaveTextContent('Hủy gói')
    expect(rows[4]).toHaveTextContent('Xem subscriptions')
    expect(rows[4]).toHaveTextContent('Hủy gói')
    expect(rows[4]).not.toHaveTextContent('Gán gói')
    expect(rows[4]).not.toHaveTextContent('Đổi gói')
  })

  it('creates PENDING with UTC dates, refetches, and prevents a duplicate submit', async () => {
    const user = userEvent.setup()
    let restaurant = availableRestaurant
    let createCalls = 0
    let requestBody: Record<string, unknown> = {}
    server.use(
      http.get(`${apiBase}/admin/restaurants`, () => HttpResponse.json(page([restaurant]))),
      http.post(`${apiBase}/admin/restaurants/:restaurantId/subscriptions`, async ({ request }) => {
        createCalls += 1
        requestBody = (await request.json()) as Record<string, unknown>
        await delay(80)
        restaurant = pendingRestaurant
        return HttpResponse.json(pendingSubscription, { status: 201 })
      }),
    )
    renderRestaurants()
    await user.click(await screen.findByRole('button', { name: 'Gán gói' }))
    await screen.findByLabelText('Package')
    await user.dblClick(screen.getByRole('button', { name: 'Tạo gói chờ' }))
    await waitFor(() => expect(createCalls).toBe(1))
    expect(requestBody.startAt).toEqual(expect.stringMatching(/Z$/))
    expect(requestBody.endAt).toEqual(expect.stringMatching(/Z$/))
    expect(requestBody.autoRenew).toBe(false)
    expect(await screen.findByText('Chờ kích hoạt')).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('Đã tạo gói chờ kích hoạt.')
  })

  it('activates the exact PENDING subscription and refetches to ACTIVE', async () => {
    const user = userEvent.setup()
    let restaurant = pendingRestaurant
    server.use(
      http.get(`${apiBase}/admin/restaurants`, () => HttpResponse.json(page([restaurant]))),
      http.get(`${apiBase}/admin/restaurants/:restaurantId/subscriptions`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('status')).toBe('PENDING')
        return HttpResponse.json(page([pendingSubscription]))
      }),
      http.post(`${apiBase}/admin/restaurants/:restaurantId/subscriptions/:subscriptionId/activate`, ({ params }) => {
        expect(params.subscriptionId).toBe(pendingSubscription.id)
        restaurant = adminRestaurant
        return HttpResponse.json(adminSubscription)
      }),
    )
    renderRestaurants()
    await user.click(await screen.findByRole('button', { name: 'Kích hoạt' }))
    expect(await screen.findByText('Xác nhận chốt quyền lợi')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Xác nhận kích hoạt' }))
    expect(await screen.findByText('Đang hoạt động')).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('Đã kích hoạt gói dịch vụ.')
  })

  it('cancels the exact PENDING subscription and refetches to AVAILABLE', async () => {
    const user = userEvent.setup()
    let restaurant = pendingRestaurant
    server.use(
      http.get(`${apiBase}/admin/restaurants`, () => HttpResponse.json(page([restaurant]))),
      http.get(`${apiBase}/admin/restaurants/:restaurantId/subscriptions`, () =>
        HttpResponse.json(page([pendingSubscription])),
      ),
      http.post(`${apiBase}/admin/restaurants/:restaurantId/subscriptions/:subscriptionId/cancel`, () => {
        restaurant = availableRestaurant
        return HttpResponse.json({ ...pendingSubscription, status: 'CANCELLED', cancelledAt: new Date().toISOString() })
      }),
    )
    renderRestaurants()
    await user.click(await screen.findByRole('button', { name: 'Hủy gói chờ' }))
    await user.click(await screen.findByRole('button', { name: 'Xác nhận hủy' }))
    expect(await screen.findByText('Chưa có gói')).toBeInTheDocument()
  })

  it('excludes the current package from immediate change choices', async () => {
    const user = userEvent.setup()
    renderRestaurants()
    await user.click(await screen.findByRole('button', { name: 'Đổi gói' }))
    const select = await screen.findByLabelText('Package mới')
    expect(select).not.toHaveTextContent('PRO — Pro')
    expect(select).toHaveTextContent('PREMIUM — Premium')
    expect(screen.getByText(/không phải gia hạn/i)).toBeInTheDocument()
  })

  it.each([
    ['SUBSCRIPTION_ALREADY_ACTIVE', 'Nhà hàng đang có gói hoạt động. Hãy sử dụng chức năng Đổi gói.'],
    ['SUBSCRIPTION_PENDING_EXISTS', 'Nhà hàng đã có một gói đang chờ. Hãy kích hoạt hoặc hủy gói đó trước.'],
    ['SUBSCRIPTION_OVERLAP', 'Nhà hàng đang có một gói khác chưa hết hạn.'],
    ['SUBSCRIPTION_NOT_ACTIVE', 'Gói được chọn không còn hoạt động hoặc chưa đến thời gian hiệu lực.'],
    ['SUBSCRIPTION_PERIOD_EXPIRED', 'Thời hạn của gói chờ đã kết thúc. Hãy hủy và tạo gói mới.'],
    ['SAME_PACKAGE_CHANGE_NOT_ALLOWED', 'Không thể đổi sang cùng gói hiện tại. Chức năng gia hạn chưa được hỗ trợ.'],
    ['INVALID_SUBSCRIPTION_TRANSITION', 'Không thể chuyển trạng thái subscription theo thao tác này.'],
    [
      'CONCURRENT_SUBSCRIPTION_UPDATE',
      'Subscription vừa được thay đổi bởi một yêu cầu khác. Vui lòng tải lại dữ liệu.',
    ],
  ])('shows mapped HTTP 409 %s, refetches, and never shows success', async (code, message) => {
    const user = userEvent.setup()
    let listCalls = 0
    server.use(
      http.get(`${apiBase}/admin/restaurants`, () => {
        listCalls += 1
        return HttpResponse.json(page([availableRestaurant]))
      }),
      http.post(`${apiBase}/admin/restaurants/:restaurantId/subscriptions`, () =>
        HttpResponse.json(
          { success: false, code, message: 'backend detail', fieldErrors: {}, timestamp: new Date().toISOString() },
          { status: 409 },
        ),
      ),
    )
    renderRestaurants()
    await user.click(await screen.findByRole('button', { name: 'Gán gói' }))
    await user.click(await screen.findByRole('button', { name: 'Tạo gói chờ' }))
    expect(await screen.findByRole('status')).toHaveTextContent(message)
    await waitFor(() => expect(listCalls).toBeGreaterThan(1))
    expect(screen.queryByText('Đã tạo gói chờ kích hoạt.')).not.toBeInTheDocument()
  })

  it('hides every mutation action without system SUBSCRIPTION_MANAGE permission', async () => {
    useAuthStore.setState({
      user: {
        ...adminUser,
        permissions: adminUser.permissions.filter((permission) => permission !== 'SUBSCRIPTION_MANAGE'),
      },
    })
    server.use(
      http.get(`${apiBase}/admin/restaurants`, () =>
        HttpResponse.json(page([availableRestaurant, { ...adminRestaurant, id: 'restaurant-2', code: 'DEMO02' }])),
      ),
    )
    renderRestaurants()
    await screen.findByText('DEMO01')
    expect(screen.queryByRole('button', { name: 'Gán gói' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Đổi gói' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hủy gói' })).not.toBeInTheDocument()
  })

  it('does not treat a tenant-bound SUPER_ADMIN as a system admin', async () => {
    useAuthStore.setState({ user: { ...adminUser, restaurantId: 'tenant-1' } })
    server.use(http.get(`${apiBase}/admin/restaurants`, () => HttpResponse.json(page([availableRestaurant]))))
    renderRestaurants()
    await screen.findByText('DEMO01')
    expect(screen.queryByRole('button', { name: 'Gán gói' })).not.toBeInTheDocument()
  })
})
