import { beforeEach, describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server, adminAuditLog, adminRestaurant, adminSubscription, adminUser } from './server'
import { useAuthStore } from '../features/auth/store/authStore'
import { setAccessToken } from '../shared/api/httpClient'
import { RestaurantsPage } from '../features/admin/pages/RestaurantsPage'
import { RestaurantDetailPage } from '../features/admin/pages/RestaurantDetailPage'
import { SubscriptionListPage } from '../features/admin/pages/SubscriptionListPage'
import { SubscriptionDetailPage } from '../features/admin/pages/SubscriptionDetailPage'
import { AuditLogsPage } from '../features/admin/pages/AuditLogsPage'

function renderAdmin(ui: ReactElement, initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('admin query-backed pages', () => {
  beforeEach(() => { useAuthStore.getState().clearSession(); useAuthStore.setState({ status: 'authenticated', user: adminUser }); setAccessToken('admin-token') })

  it('loads the restaurant list with URL-synced criteria', async () => {
    let requestUrl = ''
    server.use(http.get('http://localhost:8080/api/v1/admin/restaurants', ({ request }) => { requestUrl = request.url; return HttpResponse.json({ content: [adminRestaurant], page: 1, size: 10, totalElements: 1, totalPages: 1 }) }))
    renderAdmin(<RestaurantsPage />, '/admin/restaurants?q=demo&status=ACTIVE&page=1&size=10&sortBy=name&direction=asc')
    expect(await screen.findByText('DEMO01')).toBeInTheDocument()
    const params = new URL(requestUrl).searchParams
    expect(params.get('q')).toBe('demo')
    expect(params.get('status')).toBe('ACTIVE')
    expect(params.get('page')).toBe('1')
    expect(params.get('size')).toBe('10')
    expect(params.get('sortBy')).toBe('name')
    expect(params.get('direction')).toBe('asc')
  })

  it('renders restaurant detail and its effective subscription summary', async () => {
    renderAdmin(<Routes><Route path="/admin/restaurants/:restaurantId" element={<RestaurantDetailPage />} /></Routes>, '/admin/restaurants/restaurant-1')
    expect(await screen.findByRole('heading', { level: 2, name: 'Demo Restaurant' })).toBeInTheDocument()
    expect(screen.getByText('Subscription hiệu lực')).toBeInTheDocument()
    expect(screen.getByText('PRO')).toBeInTheDocument()
    expect(screen.getByText('Tổng user')).toBeInTheDocument()
  })

  it('loads global subscriptions and preserves search/filter parameters', async () => {
    let requestUrl = ''
    server.use(http.get('http://localhost:8080/api/v1/admin/subscriptions', ({ request }) => { requestUrl = request.url; return HttpResponse.json({ content: [{ ...adminSubscription, restaurantCode: adminRestaurant.code, restaurantName: adminRestaurant.name, restaurantStatus: adminRestaurant.status, packageName: 'Pro', effective: true, createdAt: adminSubscription.startAt }], page: 0, size: 20, totalElements: 1, totalPages: 1 }) }))
    renderAdmin(<SubscriptionListPage />, '/admin/subscriptions?restaurantId=restaurant-1&packageCode=PRO&status=ACTIVE&effective=true')
    expect(await screen.findByText('DEMO01')).toBeInTheDocument()
    const params = new URL(requestUrl).searchParams
    expect(params.get('restaurantId')).toBe('restaurant-1')
    expect(params.get('packageCode')).toBe('PRO')
    expect(params.get('status')).toBe('ACTIVE')
    expect(params.get('effective')).toBe('true')
  })

  it('shows immutable subscription feature snapshots from the detail response', async () => {
    renderAdmin(<Routes><Route path="/admin/restaurants/:restaurantId/subscriptions/:subscriptionId" element={<SubscriptionDetailPage />} /></Routes>, '/admin/restaurants/restaurant-1/subscriptions/subscription-1')
    expect(await screen.findByText('Features tại thời điểm activate/change')).toBeInTheDocument()
    expect(screen.getByText(/ordersPerDay/)).toBeInTheDocument()
    expect(screen.getByText(/Không lấy feature catalog hiện tại/)).toBeInTheDocument()
  })

  it('does not query audit logs for invalid SYSTEM plus restaurant criteria', async () => {
    let requested = false
    server.use(http.get('http://localhost:8080/api/v1/admin/audit-logs', () => { requested = true; return HttpResponse.json({ content: [adminAuditLog], page: 0, size: 20, totalElements: 1, totalPages: 1 }) }))
    renderAdmin(<AuditLogsPage />, '/admin/audit-logs?scope=SYSTEM&restaurantId=restaurant-1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Scope SYSTEM không được kết hợp restaurantId.')
    expect(requested).toBe(false)
  })

  it('keeps audit logs read-only while exposing redacted JSON', async () => {
    const user = userEvent.setup()
    renderAdmin(<AuditLogsPage />, '/admin/audit-logs')
    expect(await screen.findByText('RESTAURANT_STATUS_CHANGED')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Xóa|Sửa|Tạo/ })).not.toBeInTheDocument()
    const viewButton = screen.getByRole('button', { name: 'Xem JSON' })
    await user.click(viewButton)
    expect(await screen.findByRole('dialog')).toHaveTextContent('[REDACTED]')
  })
})
